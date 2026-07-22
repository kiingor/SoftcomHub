import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  classifyNexusSessionOutcome,
  formatNexusAttendanceType,
  getNexusConversationScopeKey,
  matchesNexusTicketConversationFilter,
  NEXUS_ATENDIMENTOS_PAGE_SIZE,
  NEXUS_NO_TICKET_IDLE_MS,
  paginateNexusAggregates,
  shouldStartNewNexusSession,
  summarizeNexusAttendances,
} from '@/lib/nexus-monitoring'
import { resolveSharedChannelOwnerId } from '@/lib/nexus-channel-resolution'
import { normalizeBrazilianPhone } from '@/lib/phone'

export type NexusHistoryRange = 'hoje' | '24h' | '7d'
export type NexusHistorySituation = 'encerrada_sem_ticket' | 'em_conversa' | 'finalizado'

export type NexusHistoryMessage = {
  id: string
  ticket_id: string | null
  cliente_id: string | null
  remetente: string
  conteudo: string | null
  tipo: string | null
  enviado_em: string
  url_imagem: string | null
  media_type: string | null
  phone_number_id: string | null
  clientes: {
    id: string
    nome: string | null
    telefone: string | null
  } | null
}

export type NexusAtendimento = {
  clienteKey: string
  clienteId: string | null
  contato: string
  telefone: string | null
  setorId: string
  setorNome: string
  lastMessageAt: string
  lastBotMessageAt: string
  lastRemetente: string
  messages: NexusHistoryMessage[]
  desfecho: 'ticket' | 'encerrada'
  ticket: {
    id: string
    numero: number | null
    status: string
    atendente: string | null
    tipoAtendimento: string | null
  } | null
}

export type NexusHistoryResponse = {
  items: NexusAtendimento[]
  page: number
  pageSize: number
  totalItems: number
  totalPages: number
  kpis: {
    total: number
    finalizadosSemTicket: number
    comTicket: number
    conversionRate: number
  }
  period: NexusHistoryPeriod
  warnings: Array<{
    code: 'AMBIGUOUS_CHANNELS_OMITTED'
    count: number
  }>
}

export type NexusHistoryPeriod = {
  since: string
  until: string
}

export type NexusHistoryQueryInput = {
  supabase: SupabaseClient
  userId: string
  sectorIds: string[]
  range: NexusHistoryRange
  timezoneOffset: number
  page: number
  q: string
  situations: NexusHistorySituation[]
}

type MessageMetadata = {
  id: string
  ticket_id: string | null
  cliente_id: string | null
  remetente: string
  enviado_em: string
  phone_number_id: string | null
  clientes: { telefone: string | null } | { telefone: string | null }[] | null
}

type ClientRow = {
  id: string
  nome: string | null
  telefone: string | null
}

type SectorChannelRow = {
  ativo: boolean | null
  instancia: string | null
  phone_number_id: string | null
}

type SectorRow = {
  id: string
  nome: string
  phone_number_id: string | null
  setor_canais: SectorChannelRow[] | SectorChannelRow | null
}

type ChannelOwnerRow = {
  id: string
  setor_id: string
  instancia: string | null
  phone_number_id: string | null
}

type TicketRow = {
  id: string
  numero: number | null
  status: string
  criado_em: string
  colaborador_id: string | null
  tipo_atendimento?: string | null
  tipo_atendimento_id: string | null
}

type NamedRow = {
  id: string
  nome: string
}

type ResolvedSectorChannel = {
  id: string
  nome: string
  channelKey: string
}

type Session = {
  firstMessageId: string
  clienteId: string | null
  contato: string
  telefone: string | null
  setorId: string
  setorNome: string
  ticketId: string | null
  messages: MessageMetadata[]
}

type AggregatedAttendance = Omit<NexusAtendimento, 'messages'> & {
  firstMessageId: string
  messageIds: string[]
  ticketId: string | null
  ticketCollaboratorId: string | null
}

type CachedHistory = {
  attendances: AggregatedAttendance[]
  kpis: NexusHistoryResponse['kpis']
  period: NexusHistoryPeriod
  warnings: NexusHistoryResponse['warnings']
}

type CacheEntry = {
  expiresAt: number
  value: Promise<CachedHistory>
}

const NEXUS_REMETENTES = ['cliente-nexus', 'bot-nexus']
const NEXUS_BOT_REMETENTE = 'bot-nexus'
const POSTGREST_PAGE_SIZE = 1000
const POSTGREST_IN_CHUNK_SIZE = 200
const HISTORY_SCAN_LIMIT = 100_000
const CACHE_TTL_MS = 30_000
const MAX_CACHE_ENTRIES = 8
const BOUNDARY_SCAN_WINDOW_MS = 24 * 60 * 60_000
const MAX_CONCURRENT_HISTORY_SCANS = 2
const MAX_QUEUED_HISTORY_SCANS = 8

const historyCache = new Map<string, CacheEntry>()
const historyScanWaiters: Array<() => void> = []
let activeHistoryScans = 0

export class NexusHistoryScanLimitError extends Error {
  readonly code = 'NEXUS_HISTORY_SCAN_LIMIT_EXCEEDED'
  readonly limit = HISTORY_SCAN_LIMIT

  constructor() {
    super(`O histórico excedeu o limite de ${HISTORY_SCAN_LIMIT} mensagens no período.`)
    this.name = 'NexusHistoryScanLimitError'
  }
}

export class NexusHistoryBoundaryLimitError extends Error {
  readonly code = 'NEXUS_HISTORY_BOUNDARY_LIMIT_EXCEEDED'

  constructor() {
    super('Não foi possível determinar o início de uma sessão Nexus com mais de 31 dias.')
    this.name = 'NexusHistoryBoundaryLimitError'
  }
}

export class NexusHistoryBusyError extends Error {
  readonly code = 'NEXUS_HISTORY_BUSY'

  constructor() {
    super('A consulta do histórico está ocupada. Tente novamente em alguns segundos.')
    this.name = 'NexusHistoryBusyError'
  }
}

async function acquireHistoryScanSlot() {
  if (activeHistoryScans < MAX_CONCURRENT_HISTORY_SCANS) {
    activeHistoryScans += 1
    return
  }
  if (historyScanWaiters.length >= MAX_QUEUED_HISTORY_SCANS) {
    throw new NexusHistoryBusyError()
  }
  await new Promise<void>((resolve) => historyScanWaiters.push(resolve))
}

function releaseHistoryScanSlot() {
  const next = historyScanWaiters.shift()
  if (next) {
    next()
    return
  }
  activeHistoryScans = Math.max(0, activeHistoryScans - 1)
}

async function runWithHistoryScanSlot<T>(loader: () => Promise<T>) {
  await acquireHistoryScanSlot()
  try {
    return await loader()
  } finally {
    releaseHistoryScanSlot()
  }
}

function chunkValues<T>(values: readonly T[], size = POSTGREST_IN_CHUNK_SIZE): T[][] {
  const chunks: T[][] = []
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size))
  }
  return chunks
}

function relationRows<T>(value: T[] | T | null | undefined): T[] {
  if (!value) return []
  return Array.isArray(value) ? value : [value]
}

function getSessionGapMs() {
  return NEXUS_NO_TICKET_IDLE_MS
}

export function resolveNexusHistoryPeriod(
  range: NexusHistoryRange,
  timezoneOffset: number,
  nowMs: number,
): NexusHistoryPeriod {
  let sinceMs: number

  if (range === 'hoje') {
    const localNow = new Date(nowMs - timezoneOffset * 60_000)
    localNow.setUTCHours(0, 0, 0, 0)
    sinceMs = localNow.getTime() + timezoneOffset * 60_000
  } else {
    const durationMs = range === '24h' ? 24 * 60 * 60_000 : 7 * 24 * 60 * 60_000
    sinceMs = nowMs - durationMs
  }

  return {
    since: new Date(sinceMs).toISOString(),
    until: new Date(nowMs).toISOString(),
  }
}

function makeCacheKey(
  userId: string,
  sectorIds: readonly string[],
  range: NexusHistoryRange,
  timezoneOffset: number,
  period: NexusHistoryPeriod,
) {
  return [
    userId,
    [...sectorIds].sort().join(','),
    range,
    timezoneOffset,
    period.since,
    period.until,
  ].join('|')
}

function pruneCache(nowMs: number) {
  for (const [key, entry] of historyCache) {
    if (entry.expiresAt <= nowMs) historyCache.delete(key)
  }

  while (historyCache.size > MAX_CACHE_ENTRIES) {
    const oldestKey = historyCache.keys().next().value
    if (!oldestKey) break
    historyCache.delete(oldestKey)
  }
}

async function loadRowsByIds<T>(
  supabase: SupabaseClient,
  table: string,
  columns: string,
  ids: readonly string[],
): Promise<T[]> {
  const rows: T[] = []

  for (const idChunk of chunkValues([...new Set(ids)])) {
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .in('id', idChunk)

    if (error) throw error
    rows.push(...((data || []) as T[]))
  }

  return rows
}

async function loadSectors(supabase: SupabaseClient, sectorIds: readonly string[]) {
  const sectors: SectorRow[] = []

  for (const sectorChunk of chunkValues([...new Set(sectorIds)])) {
    const { data, error } = await supabase
      .from('setores')
      .select('id, nome, phone_number_id, setor_canais(ativo, instancia, phone_number_id)')
      .in('id', sectorChunk)
      .eq('assistente_ia', true)
      .order('id', { ascending: true })

    if (error) throw error
    sectors.push(...((data || []) as SectorRow[]))
  }

  return sectors
}

async function resolveUnambiguousSectorChannels(
  supabase: SupabaseClient,
  sectors: readonly SectorRow[],
) {
  const candidateOwners = new Map<string, Set<string>>()

  for (const sector of sectors) {
    for (const channel of [
      { phone_number_id: sector.phone_number_id, instancia: null },
      ...relationRows(sector.setor_canais).filter((candidate) => candidate.ativo),
    ]) {
      for (const identifier of [channel.phone_number_id, channel.instancia]) {
        if (!identifier) continue
        const owners = candidateOwners.get(identifier) || new Set<string>()
        owners.add(sector.id)
        candidateOwners.set(identifier, owners)
      }
    }
  }

  const identifiers = [...candidateOwners.keys()]
  if (identifiers.length === 0) {
    return {
      sectorsByChannel: new Map<string, ResolvedSectorChannel>(),
      collisionCount: 0,
    }
  }

  const activeOwners = new Map<string, Set<string>>()
  const activeRowsByIdentifier = new Map<string, Map<string, ChannelOwnerRow>>()
  const legacyOwners = new Map<string, Set<string>>()
  const identifierSet = new Set(identifiers)

  const loadOwnerRows = async (filterColumn: 'phone_number_id' | 'instancia', values: string[]) => {
    const rows: ChannelOwnerRow[] = []
    for (let page = 0; ; page += 1) {
      const from = page * POSTGREST_PAGE_SIZE
      const { data, error } = await supabase
        .from('setor_canais')
        .select('id, setor_id, instancia, phone_number_id')
        .eq('ativo', true)
        .in(filterColumn, values)
        .order('id', { ascending: true })
        .range(from, from + POSTGREST_PAGE_SIZE - 1)

      if (error) throw error
      const batch = (data || []) as ChannelOwnerRow[]
      rows.push(...batch)
      if (batch.length < POSTGREST_PAGE_SIZE) break
    }
    return rows
  }

  const loadLegacyOwnerRows = async (values: string[]) => {
    const rows: ChannelOwnerRow[] = []
    for (let page = 0; ; page += 1) {
      const from = page * POSTGREST_PAGE_SIZE
      const { data, error } = await supabase
        .from('setores')
        .select('id, phone_number_id')
        .in('phone_number_id', values)
        .order('id', { ascending: true })
        .range(from, from + POSTGREST_PAGE_SIZE - 1)

      if (error) throw error
      const batch = data || []
      rows.push(...batch.map((sector) => ({
        id: `legacy:${sector.id}`,
        setor_id: sector.id,
        instancia: null,
        phone_number_id: sector.phone_number_id,
      })))
      if (batch.length < POSTGREST_PAGE_SIZE) break
    }
    return rows
  }

  for (const identifierChunk of chunkValues(identifiers)) {
    const [phoneRows, instanceRows, legacyRows] = await Promise.all([
      loadOwnerRows('phone_number_id', identifierChunk),
      loadOwnerRows('instancia', identifierChunk),
      loadLegacyOwnerRows(identifierChunk),
    ])

    for (const row of [...phoneRows, ...instanceRows]) {
      for (const identifier of [row.phone_number_id, row.instancia]) {
        if (!identifier || !identifierSet.has(identifier)) continue
        const owners = activeOwners.get(identifier) || new Set<string>()
        owners.add(row.setor_id)
        activeOwners.set(identifier, owners)
        const rows = activeRowsByIdentifier.get(identifier) || new Map<string, ChannelOwnerRow>()
        rows.set(row.id, row)
        activeRowsByIdentifier.set(identifier, rows)
      }
    }
    for (const row of legacyRows) {
      for (const identifier of [row.phone_number_id, row.instancia]) {
        if (!identifier || !identifierSet.has(identifier)) continue
        const owners = legacyOwners.get(identifier) || new Set<string>()
        owners.add(row.setor_id)
        legacyOwners.set(identifier, owners)
      }
    }
  }

  const sectorsById = new Map(sectors.map((sector) => [sector.id, sector]))
  const sectorsByChannel = new Map<string, ResolvedSectorChannel>()
  let collisionCount = 0

  for (const identifier of candidateOwners.keys()) {
    const activeIdentifierOwners = activeOwners.get(identifier)
    const owners = activeIdentifierOwners?.size
      ? activeIdentifierOwners
      : legacyOwners.get(identifier)
    const sectorId = resolveSharedChannelOwnerId(owners || [])
    if (!sectorId) {
      collisionCount += 1
      continue
    }

    const sector = sectorsById.get(sectorId)
    if (!sector) {
      collisionCount += 1
      continue
    }
    let channelKey = `legacy:${sectorId}`
    if (activeIdentifierOwners?.size) {
      const matchingRows = activeRowsByIdentifier.get(identifier)
      const preferredRows = matchingRows
        ? [...matchingRows.values()].filter((row) => row.setor_id === sectorId)
        : []
      if (preferredRows.length !== 1) {
        collisionCount += 1
        continue
      }
      channelKey = `channel:${preferredRows[0].id}`
    }
    sectorsByChannel.set(identifier, { ...sector, channelKey })
  }

  return { sectorsByChannel, collisionCount }
}

export async function resolveNexusChannelConfiguration(
  supabase: SupabaseClient,
  sectorIds: readonly string[],
) {
  const sectors = await loadSectors(supabase, sectorIds)
  const { sectorsByChannel, collisionCount } = await resolveUnambiguousSectorChannels(
    supabase,
    sectors,
  )

  return {
    sectors: sectors.map((sector) => ({ id: sector.id, nome: sector.nome })),
    channels: [...sectorsByChannel].map(([identifier, sector]) => ({
      identifier,
      channelKey: sector.channelKey,
      sectorId: sector.id,
      sectorName: sector.nome,
    })),
    warnings: collisionCount > 0
      ? [{ code: 'AMBIGUOUS_CHANNELS_OMITTED' as const, count: collisionCount }]
      : [],
  }
}

type ScanBudget = {
  count: number
}

type BoundarySessionState = {
  channelKey: string
  earliestMessageAtMs: number
}

async function scanMessageMetadata(
  supabase: SupabaseClient,
  channelIds: readonly string[],
  period: NexusHistoryPeriod,
  options?: {
    budget?: ScanBudget
    untilExclusive?: boolean
  },
) {
  const messages: MessageMetadata[] = []
  const budget = options?.budget || { count: 0 }

  for (const channelChunk of chunkValues([...new Set(channelIds)])) {
    let offset = 0

    while (true) {
      const requestSize = Math.min(
        POSTGREST_PAGE_SIZE,
        HISTORY_SCAN_LIMIT + 1 - budget.count,
      )
      if (requestSize <= 0) throw new NexusHistoryScanLimitError()

      let query = supabase
        .from('mensagens')
        .select('id, ticket_id, cliente_id, remetente, enviado_em, phone_number_id, clientes(telefone)')
        .in('remetente', NEXUS_REMETENTES)
        .in('phone_number_id', channelChunk)
        .gte('enviado_em', period.since)
        .order('enviado_em', { ascending: true })
        .order('id', { ascending: true })
        .range(offset, offset + requestSize - 1)

      query = options?.untilExclusive
        ? query.lt('enviado_em', period.until)
        : query.lte('enviado_em', period.until)

      const { data, error } = await query
      if (error) throw error
      const batch = (data || []) as MessageMetadata[]
      if (batch.length === 0) break

      messages.push(...batch)
      budget.count += batch.length
      if (budget.count > HISTORY_SCAN_LIMIT) throw new NexusHistoryScanLimitError()

      offset += batch.length
      if (batch.length < requestSize) break
    }
  }

  messages.sort((first, second) => {
    const timestampOrder = Date.parse(first.enviado_em) - Date.parse(second.enviado_em)
    return timestampOrder || first.id.localeCompare(second.id)
  })

  return messages
}

function getBoundaryScopeKey(
  message: MessageMetadata,
  sectorsByChannel: ReadonlyMap<string, ResolvedSectorChannel>,
) {
  if (!message.phone_number_id) return null
  const sector = sectorsByChannel.get(message.phone_number_id)
  if (!sector) return null
  const client = relationRows(message.clientes)[0]
  const normalizedPhone = normalizeBrazilianPhone(client?.telefone)
  if (!message.cliente_id && !normalizedPhone) return null
  return getNexusConversationScopeKey(
    sector.id,
    message.cliente_id,
    normalizedPhone,
    message.id,
    sector.channelKey,
  )
}

async function scanHistoryMetadataWithBoundary(
  supabase: SupabaseClient,
  sectorsByChannel: ReadonlyMap<string, ResolvedSectorChannel>,
  period: NexusHistoryPeriod,
) {
  const budget: ScanBudget = { count: 0 }
  const channelIds = [...sectorsByChannel.keys()]
  const periodMessages = await scanMessageMetadata(supabase, channelIds, period, { budget })
  const sinceMs = Date.parse(period.since)
  const sessionGapMs = getSessionGapMs()
  const boundaryCutoffMs = sinceMs + sessionGapMs
  const states = new Map<string, BoundarySessionState>()
  const channelIdsByScope = new Map<string, string[]>()

  for (const [channelId, sector] of sectorsByChannel) {
    const scopedChannelIds = channelIdsByScope.get(sector.channelKey) || []
    scopedChannelIds.push(channelId)
    channelIdsByScope.set(sector.channelKey, scopedChannelIds)
  }

  for (const message of periodMessages) {
    const scopeKey = getBoundaryScopeKey(message, sectorsByChannel)
    const messageAtMs = Date.parse(message.enviado_em)
    if (!scopeKey || !Number.isFinite(messageAtMs) || messageAtMs > boundaryCutoffMs) continue

    const current = states.get(scopeKey)
    if (!current) {
      const sector = message.phone_number_id
        ? sectorsByChannel.get(message.phone_number_id)
        : null
      if (!sector) continue
      states.set(scopeKey, {
        channelKey: sector.channelKey,
        earliestMessageAtMs: messageAtMs,
      })
      continue
    }

    current.earliestMessageAtMs = Math.min(current.earliestMessageAtMs, messageAtMs)
  }

  const priorMessages: MessageMetadata[] = []
  let cursorMs = sinceMs
  const oldestBoundaryMs = sinceMs - 31 * BOUNDARY_SCAN_WINDOW_MS

  while (states.size > 0) {
    if (cursorMs <= oldestBoundaryMs) {
      throw new NexusHistoryBoundaryLimitError()
    }

    const windowStartMs = Math.max(oldestBoundaryMs, cursorMs - BOUNDARY_SCAN_WINDOW_MS)
    const boundaryChannelIds = [...new Set(
      [...states.values()].flatMap((state) => channelIdsByScope.get(state.channelKey) || []),
    )]
    const windowMessages = await scanMessageMetadata(
      supabase,
      boundaryChannelIds,
      {
        since: new Date(windowStartMs).toISOString(),
        until: new Date(cursorMs).toISOString(),
      },
      {
        budget,
        untilExclusive: true,
      },
    )
    const messagesByScope = new Map<string, MessageMetadata[]>()

    for (const message of windowMessages) {
      const scopeKey = getBoundaryScopeKey(message, sectorsByChannel)
      if (!scopeKey || !states.has(scopeKey)) continue
      const scopedMessages = messagesByScope.get(scopeKey) || []
      scopedMessages.push(message)
      messagesByScope.set(scopeKey, scopedMessages)
    }

    for (const [scopeKey, state] of states) {
      const scopedMessages = messagesByScope.get(scopeKey) || []
      let chainCursorMs = state.earliestMessageAtMs
      const connectedMessages: MessageMetadata[] = []
      let foundBoundaryGap = false

      for (let index = scopedMessages.length - 1; index >= 0; index -= 1) {
        const message = scopedMessages[index]
        const messageAtMs = Date.parse(message.enviado_em)
        if (!Number.isFinite(messageAtMs) || messageAtMs >= chainCursorMs) continue

        if (chainCursorMs - messageAtMs >= sessionGapMs) {
          foundBoundaryGap = true
          break
        }

        connectedMessages.push(message)
        chainCursorMs = messageAtMs
      }

      if (connectedMessages.length === 0) {
        states.delete(scopeKey)
        continue
      }

      priorMessages.push(...connectedMessages)
      state.earliestMessageAtMs = chainCursorMs

      if (foundBoundaryGap || chainCursorMs - windowStartMs >= sessionGapMs) {
        states.delete(scopeKey)
      }
    }

    cursorMs = windowStartMs
  }

  const messagesById = new Map<string, MessageMetadata>()
  for (const message of [...priorMessages, ...periodMessages]) {
    messagesById.set(message.id, message)
  }

  return [...messagesById.values()].sort((first, second) => {
    const timestampOrder = Date.parse(first.enviado_em) - Date.parse(second.enviado_em)
    return timestampOrder || first.id.localeCompare(second.id)
  })
}

async function loadTickets(supabase: SupabaseClient, ticketIds: readonly string[]) {
  const tickets: TicketRow[] = []

  for (const ticketChunk of chunkValues([...new Set(ticketIds)])) {
    const result = await supabase
      .from('tickets')
      .select('id, numero, status, criado_em, colaborador_id, tipo_atendimento, tipo_atendimento_id')
      .in('id', ticketChunk)
    let resultData = (result.data || []) as TicketRow[]
    let resultError = result.error

    const missingClassifierColumn = resultError
      && ['42703', 'PGRST204'].includes(resultError.code || '')
      && resultError.message.includes('tipo_atendimento')

    if (missingClassifierColumn) {
      const fallbackResult = await supabase
        .from('tickets')
        .select('id, numero, status, criado_em, colaborador_id, tipo_atendimento_id')
        .in('id', ticketChunk)
      resultData = (fallbackResult.data || []) as TicketRow[]
      resultError = fallbackResult.error
    }

    if (resultError) throw resultError
    tickets.push(...resultData)
  }

  return tickets
}

function groupMessagesIntoSessions(
  messages: readonly MessageMetadata[],
  clientsById: ReadonlyMap<string, ClientRow>,
  sectorsByChannel: ReadonlyMap<string, ResolvedSectorChannel>,
) {
  const groups = new Map<string, {
    clienteId: string | null
    contato: string
    telefone: string | null
    setorId: string
    setorNome: string
    messages: MessageMetadata[]
  }>()

  for (const message of messages) {
    const sector = message.phone_number_id
      ? sectorsByChannel.get(message.phone_number_id)
      : null
    if (!sector) continue

    const client = message.cliente_id ? clientsById.get(message.cliente_id) : null
    const normalizedPhone = normalizeBrazilianPhone(client?.telefone)
    // A message without any stable client identity cannot be grouped into a
    // conversation safely; using its own ID would count every row as a session.
    if (!message.cliente_id && !normalizedPhone) continue
    const groupKey = getNexusConversationScopeKey(
      sector.id,
      message.cliente_id,
      normalizedPhone,
      message.id,
      sector.channelKey,
    )
    const current = groups.get(groupKey)

    if (current) {
      current.messages.push(message)
      continue
    }

    groups.set(groupKey, {
      clienteId: message.cliente_id,
      contato: client?.nome || client?.telefone || 'Cliente sem nome',
      telefone: client?.telefone || null,
      setorId: sector.id,
      setorNome: sector.nome,
      messages: [message],
    })
  }

  const sessions: Session[] = []
  const maxGapMs = getSessionGapMs()

  for (const group of groups.values()) {
    let current: Session | null = null

    for (const message of group.messages) {
      const incomingTicketId = message.ticket_id || null
      const previousMessage = current?.messages[current.messages.length - 1]
      const gapMs = previousMessage
        ? Date.parse(message.enviado_em) - Date.parse(previousMessage.enviado_em)
        : 0

      if (shouldStartNewNexusSession({
        hasCurrentSession: Boolean(current),
        currentTicketId: current?.ticketId || null,
        incomingTicketId,
        gapMs,
        maxGapMs,
      })) {
        current = {
          firstMessageId: message.id,
          clienteId: group.clienteId,
          contato: group.contato,
          telefone: group.telefone,
          setorId: group.setorId,
          setorNome: group.setorNome,
          ticketId: incomingTicketId,
          messages: [],
        }
        sessions.push(current)
      }

      if (!current) continue
      if (!current.ticketId && incomingTicketId) current.ticketId = incomingTicketId
      current.messages.push(message)
    }
  }

  return sessions
}

function resolveCanonicalTicketSessions(
  sessions: readonly Session[],
  ticketsById: ReadonlyMap<string, TicketRow>,
) {
  const selected = new Map<string, {
    firstMessageId: string
    distanceToCreationMs: number
    lastMessageAtMs: number
  }>()

  for (const session of sessions) {
    if (!session.ticketId) continue
    const lastMessageAtMs = Date.parse(session.messages[session.messages.length - 1]?.enviado_em || '')
    if (!Number.isFinite(lastMessageAtMs)) continue

    const ticketCreatedAtMs = Date.parse(ticketsById.get(session.ticketId)?.criado_em || '')
    const distanceToCreationMs = Number.isFinite(ticketCreatedAtMs)
      ? Math.abs(ticketCreatedAtMs - lastMessageAtMs)
      : Number.POSITIVE_INFINITY
    const current = selected.get(session.ticketId)
    const shouldReplace = !current
      || distanceToCreationMs < current.distanceToCreationMs
      || (distanceToCreationMs === current.distanceToCreationMs
        && lastMessageAtMs > current.lastMessageAtMs)

    if (shouldReplace) {
      selected.set(session.ticketId, {
        firstMessageId: session.firstMessageId,
        distanceToCreationMs,
        lastMessageAtMs,
      })
    }
  }

  return new Map(
    [...selected].map(([ticketId, candidate]) => [ticketId, candidate.firstMessageId]),
  )
}

function createAggregatedAttendances(
  sessions: readonly Session[],
  ticketsById: ReadonlyMap<string, TicketRow>,
  canonicalTicketSessions: ReadonlyMap<string, string>,
  collaboratorNames: ReadonlyMap<string, string>,
  attendanceTypeNames: ReadonlyMap<string, string>,
  nowMs: number,
) {
  const attendances: AggregatedAttendance[] = []

  for (const session of sessions) {
    const lastMessage = session.messages[session.messages.length - 1]
    if (!lastMessage) continue

    const effectiveTicketId = session.ticketId
      && canonicalTicketSessions.get(session.ticketId) === session.firstMessageId
      ? session.ticketId
      : null
    const ticket = effectiveTicketId ? ticketsById.get(effectiveTicketId) || null : null
    const outcome = classifyNexusSessionOutcome({
      messages: session.messages,
      ticketId: effectiveTicketId,
      nowMs,
    })
    if (!outcome) continue

    const lastBotMessage = [...session.messages]
      .reverse()
      .find((message) => message.remetente === NEXUS_BOT_REMETENTE)
    const attendanceType = ticket
      ? formatNexusAttendanceType(ticket.tipo_atendimento)
        || (ticket.tipo_atendimento_id
          ? attendanceTypeNames.get(ticket.tipo_atendimento_id) || null
          : null)
      : null

    attendances.push({
      firstMessageId: session.firstMessageId,
      messageIds: session.messages.map((message) => message.id),
      ticketId: effectiveTicketId,
      ticketCollaboratorId: ticket?.colaborador_id || null,
      clienteKey: `${session.clienteId || session.telefone || 'x'}::${session.firstMessageId}`,
      clienteId: session.clienteId,
      contato: session.contato,
      telefone: session.telefone,
      setorId: session.setorId,
      setorNome: session.setorNome,
      lastMessageAt: lastMessage.enviado_em,
      lastBotMessageAt: lastBotMessage?.enviado_em || '',
      lastRemetente: lastMessage.remetente,
      desfecho: outcome === 'ticket' ? 'ticket' : 'encerrada',
      ticket: ticket
        ? {
            id: ticket.id,
            numero: ticket.numero ?? null,
            status: ticket.status,
            atendente: ticket.colaborador_id
              ? collaboratorNames.get(ticket.colaborador_id) || null
              : null,
            tipoAtendimento: attendanceType,
          }
        : null,
    })
  }

  attendances.sort((first, second) => {
    const timestampOrder = Date.parse(second.lastMessageAt) - Date.parse(first.lastMessageAt)
    return timestampOrder || second.firstMessageId.localeCompare(first.firstMessageId)
  })

  const displayedTicketIds = new Set<string>()
  return attendances.filter((attendance) => {
    const ticketId = attendance.ticketId
    if (!ticketId) return true
    if (displayedTicketIds.has(ticketId)) return false
    displayedTicketIds.add(ticketId)
    return true
  })
}

async function loadCachedHistory(
  supabase: SupabaseClient,
  sectorIds: readonly string[],
  period: NexusHistoryPeriod,
): Promise<CachedHistory> {
  if (sectorIds.length === 0) {
    return createEmptyHistory(period)
  }

  const sectors = await loadSectors(supabase, sectorIds)
  const { sectorsByChannel, collisionCount } = await resolveUnambiguousSectorChannels(
    supabase,
    sectors,
  )

  if (sectorsByChannel.size === 0) return createEmptyHistory(period, collisionCount)

  const messages = await scanHistoryMetadataWithBoundary(
    supabase,
    sectorsByChannel,
    period,
  )
  const clientIds = messages
    .map((message) => message.cliente_id)
    .filter((clientId): clientId is string => Boolean(clientId))
  const clients = await loadRowsByIds<ClientRow>(
    supabase,
    'clientes',
    'id, nome, telefone',
    clientIds,
  )
  const clientsById = new Map(clients.map((client) => [client.id, client]))
  const sessions = groupMessagesIntoSessions(messages, clientsById, sectorsByChannel)
  const ticketIds = sessions
    .map((session) => session.ticketId)
    .filter((ticketId): ticketId is string => Boolean(ticketId))
  const tickets = await loadTickets(supabase, ticketIds)
  const ticketsById = new Map(tickets.map((ticket) => [ticket.id, ticket]))
  const canonicalTicketSessions = resolveCanonicalTicketSessions(sessions, ticketsById)
  const collaboratorIds = tickets
    .map((ticket) => ticket.colaborador_id)
    .filter((collaboratorId): collaboratorId is string => Boolean(collaboratorId))
  const attendanceTypeIds = tickets
    .map((ticket) => ticket.tipo_atendimento_id)
    .filter((attendanceTypeId): attendanceTypeId is string => Boolean(attendanceTypeId))
  const [collaborators, attendanceTypes] = await Promise.all([
    loadRowsByIds<NamedRow>(supabase, 'colaboradores', 'id, nome', collaboratorIds),
    loadRowsByIds<NamedRow>(supabase, 'tipos_atendimento', 'id, nome', attendanceTypeIds),
  ])
  const collaboratorNames = new Map(collaborators.map((row) => [row.id, row.nome]))
  const attendanceTypeNames = new Map(attendanceTypes.map((row) => [row.id, row.nome]))
  const periodSinceMs = Date.parse(period.since)
  const periodUntilMs = Date.parse(period.until)
  const attendances = createAggregatedAttendances(
    sessions,
    ticketsById,
    canonicalTicketSessions,
    collaboratorNames,
    attendanceTypeNames,
    periodUntilMs,
  ).filter((attendance) => {
    const lastMessageMs = Date.parse(attendance.lastMessageAt)
    return lastMessageMs >= periodSinceMs && lastMessageMs <= periodUntilMs
  })
  const summary = summarizeNexusAttendances(attendances)

  return {
    attendances,
    kpis: {
      total: summary.total,
      finalizadosSemTicket: summary.encerradosSemTicket,
      comTicket: summary.tickets,
      conversionRate: summary.conversionRate,
    },
    period,
    warnings: collisionCount > 0
      ? [{ code: 'AMBIGUOUS_CHANNELS_OMITTED', count: collisionCount }]
      : [],
  }
}

function createEmptyHistory(
  period: NexusHistoryPeriod,
  ambiguousChannelCount = 0,
): CachedHistory {
  return {
    attendances: [],
    kpis: {
      total: 0,
      finalizadosSemTicket: 0,
      comTicket: 0,
      conversionRate: 0,
    },
    period,
    warnings: ambiguousChannelCount > 0
      ? [{ code: 'AMBIGUOUS_CHANNELS_OMITTED', count: ambiguousChannelCount }]
      : [],
  }
}

function matchesSearch(attendance: AggregatedAttendance, query: string) {
  const normalizedQuery = query.trim().toLocaleLowerCase('pt-BR')
  if (!normalizedQuery) return true

  const textValues = [
    attendance.contato,
    attendance.telefone || '',
    attendance.setorNome,
    attendance.ticket?.tipoAtendimento || '',
    String(attendance.ticket?.numero || ''),
  ]
  if (textValues.some((value) => value.toLocaleLowerCase('pt-BR').includes(normalizedQuery))) {
    return true
  }

  const queryDigits = normalizedQuery.replace(/\D/g, '')
  if (!queryDigits) return false
  const phoneDigits = (attendance.telefone || '').replace(/\D/g, '')
  return phoneDigits.includes(queryDigits)
    || String(attendance.ticket?.numero || '').includes(queryDigits)
}

function matchesSituations(
  attendance: AggregatedAttendance,
  situations: readonly NexusHistorySituation[],
) {
  if (situations.length === 0) return true

  return situations.some((situation) => {
    if (situation === 'encerrada_sem_ticket') return attendance.desfecho === 'encerrada'
    return matchesNexusTicketConversationFilter(
      attendance.ticket?.status,
      situation,
      Boolean(attendance.ticketCollaboratorId),
    )
  })
}

async function loadPageMessages(
  supabase: SupabaseClient,
  attendances: readonly AggregatedAttendance[],
) {
  const messageIds = attendances.flatMap((attendance) => attendance.messageIds)
  const messages = await loadRowsByIds<NexusHistoryMessage>(
    supabase,
    'mensagens',
    'id, ticket_id, cliente_id, remetente, conteudo, tipo, enviado_em, url_imagem, media_type, phone_number_id, clientes(id, nome, telefone)',
    messageIds,
  )
  return new Map(messages.map((message) => [message.id, message]))
}

function toPublicAttendance(
  attendance: AggregatedAttendance,
  messagesById: ReadonlyMap<string, NexusHistoryMessage>,
): NexusAtendimento {
  return {
    clienteKey: attendance.clienteKey,
    clienteId: attendance.clienteId,
    contato: attendance.contato,
    telefone: attendance.telefone,
    setorId: attendance.setorId,
    setorNome: attendance.setorNome,
    lastMessageAt: attendance.lastMessageAt,
    lastBotMessageAt: attendance.lastBotMessageAt,
    lastRemetente: attendance.lastRemetente,
    messages: attendance.messageIds
      .map((messageId) => messagesById.get(messageId))
      .filter((message): message is NexusHistoryMessage => Boolean(message)),
    desfecho: attendance.desfecho,
    ticket: attendance.ticket,
  }
}

export async function queryNexusAttendances({
  supabase,
  userId,
  sectorIds,
  range,
  timezoneOffset,
  page,
  q,
  situations,
}: NexusHistoryQueryInput): Promise<NexusHistoryResponse> {
  const requestNowMs = Date.now()
  const windowStartMs = Math.floor(requestNowMs / CACHE_TTL_MS) * CACHE_TTL_MS
  const period = resolveNexusHistoryPeriod(range, timezoneOffset, windowStartMs)
  const normalizedSectorIds = [...new Set(sectorIds)].sort()
  const cacheKey = makeCacheKey(
    userId,
    normalizedSectorIds,
    range,
    timezoneOffset,
    period,
  )

  pruneCache(requestNowMs)
  let cacheEntry = historyCache.get(cacheKey)

  if (!cacheEntry) {
    const value = runWithHistoryScanSlot(() => (
      loadCachedHistory(supabase, normalizedSectorIds, period)
    ))
    cacheEntry = {
      expiresAt: windowStartMs + CACHE_TTL_MS,
      value,
    }
    historyCache.set(cacheKey, cacheEntry)
    pruneCache(requestNowMs)

    value.catch((error) => {
      if (
        error instanceof NexusHistoryScanLimitError
        || error instanceof NexusHistoryBoundaryLimitError
      ) return
      if (historyCache.get(cacheKey)?.value === value) historyCache.delete(cacheKey)
    })
  }

  const cachedHistory = await cacheEntry.value
  const filteredAttendances = cachedHistory.attendances.filter((attendance) => (
    matchesSituations(attendance, situations) && matchesSearch(attendance, q)
  ))
  const paginated = paginateNexusAggregates(
    filteredAttendances,
    page,
    NEXUS_ATENDIMENTOS_PAGE_SIZE,
  )
  const messagesById = await loadPageMessages(supabase, paginated.items)

  return {
    items: paginated.items.map((attendance) => toPublicAttendance(attendance, messagesById)),
    page: paginated.pageIndex,
    pageSize: paginated.pageSize,
    totalItems: paginated.totalItems,
    totalPages: paginated.totalPages,
    kpis: cachedHistory.kpis,
    period: cachedHistory.period,
    warnings: cachedHistory.warnings,
  }
}
