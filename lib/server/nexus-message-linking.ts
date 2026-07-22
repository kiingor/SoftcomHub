import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { resolveSharedChannelOwnerId } from '@/lib/nexus-channel-resolution'
import { NEXUS_NO_TICKET_IDLE_MS } from '@/lib/nexus-monitoring'
import { normalizeBrazilianPhone } from '@/lib/phone'

const NEXUS_REMETENTES = new Set(['cliente-nexus', 'bot-nexus'])
const QUERY_CHUNK_SIZE = 200
const UPDATE_CHUNK_SIZE = 200
const SESSION_MESSAGE_LIMIT = 10_000
const SESSION_SCAN_WINDOW_MS = 24 * 60 * 60_000
const SESSION_BOUNDARY_LIMIT_MS = 31 * SESSION_SCAN_WINDOW_MS

type ChannelRow = {
  id: string
  setor_id: string
  instancia: string | null
  phone_number_id: string | null
  isLegacy: boolean
  isNexusSector: boolean
}

type NexusMessageRow = {
  id: string
  cliente_id: string | null
  enviado_em: string
  phone_number_id: string | null
  remetente: string | null
  ticket_id: string | null
  clientes: { telefone: string | null } | Array<{ telefone: string | null }> | null
}

export type PreparedNexusSession = {
  sourceSectorId: string
  messageIds: string[]
  pendingMessageIds: string[]
  alreadyLinkedCount: number
}

export class NexusSessionLinkValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'NexusSessionLinkValidationError'
  }
}

export class NexusSessionTicketClaimConflictError extends NexusSessionLinkValidationError {
  readonly winnerTicketId: string

  constructor(winnerTicketId: string) {
    super('A sessão Nexus já está vinculada a outro ticket.')
    this.name = 'NexusSessionTicketClaimConflictError'
    this.winnerTicketId = winnerTicketId
  }
}

function chunkValues<T>(values: readonly T[], size: number) {
  const chunks: T[][] = []
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size))
  }
  return chunks
}

function getClientPhone(message: NexusMessageRow) {
  const client = Array.isArray(message.clientes) ? message.clientes[0] : message.clientes
  return client?.telefone || null
}

async function loadAllSectorChannels(
  supabase: SupabaseClient,
) {
  const channels: ChannelRow[] = []
  const sectors: Array<{
    id: string
    phone_number_id: string | null
    assistente_ia: boolean | null
  }> = []

  for (let page = 0; ; page += 1) {
    const from = page * 1000
    const { data, error } = await supabase
      .from('setores')
      .select('id, phone_number_id, assistente_ia')
      .order('id', { ascending: true })
      .range(from, from + 999)

    if (error) throw error
    const rows = data || []
    sectors.push(...rows)
    if (rows.length < 1000) break
  }

  const nexusSectorIds = new Set(
    sectors.filter((sector) => sector.assistente_ia).map((sector) => sector.id),
  )

  for (const sectorChunk of chunkValues(sectors.map((sector) => sector.id), QUERY_CHUNK_SIZE)) {
    for (let page = 0; ; page += 1) {
      const from = page * 1000
      const { data, error } = await supabase
        .from('setor_canais')
        .select('id, setor_id, instancia, phone_number_id')
        .eq('ativo', true)
        .in('setor_id', sectorChunk)
        .order('id', { ascending: true })
        .range(from, from + 999)

      if (error) throw error
      const rows = (data || []) as ChannelRow[]
      channels.push(...rows.map((channel) => ({
        ...channel,
        isLegacy: false,
        isNexusSector: nexusSectorIds.has(channel.setor_id),
      })))
      if (rows.length < 1000) break
    }
  }

  channels.push(...sectors
    .filter((sector) => Boolean(sector.phone_number_id))
    .map((sector) => ({
      id: `legacy:${sector.id}`,
      setor_id: sector.id,
      instancia: null,
      phone_number_id: sector.phone_number_id,
      isLegacy: true,
      isNexusSector: nexusSectorIds.has(sector.id),
    })))

  return channels
}

function getAuthoritativeChannels(channels: readonly ChannelRow[]) {
  const activeIdentifiers = new Set(
    channels
      .filter((channel) => !channel.isLegacy)
      .flatMap(getChannelIdentifiers),
  )
  return channels.filter((channel) => (
    !channel.isLegacy
    || !getChannelIdentifiers(channel).some((identifier) => activeIdentifiers.has(identifier))
  ))
}

function getChannelIdentifiers(channel: ChannelRow) {
  return [channel.phone_number_id, channel.instancia]
    .filter((identifier): identifier is string => Boolean(identifier))
}

function getCanonicalChannelKey(channel: ChannelRow) {
  return channel.isLegacy ? `legacy:${channel.setor_id}` : `channel:${channel.id}`
}

function getUnambiguousChannelIdentifiers(
  allChannels: readonly ChannelRow[],
  sourceSectorId: string,
  sourceIdentifiers: ReadonlySet<string>,
) {
  const resolved = new Map<string, string>()

  for (const identifier of sourceIdentifiers) {
    const matchingChannels = allChannels.filter((channel) => (
      getChannelIdentifiers(channel).includes(identifier)
    ))
    const primarySectorId = resolveSharedChannelOwnerId(
      matchingChannels.map((channel) => channel.setor_id),
    )
    const channelKeys = new Set(
      matchingChannels
        .filter((channel) => channel.setor_id === sourceSectorId)
        .map(getCanonicalChannelKey),
    )
    if (
      primarySectorId === sourceSectorId
      && channelKeys.size === 1
    ) {
      resolved.set(identifier, [...channelKeys][0])
    }
  }

  return resolved
}

async function resolveSafeNexusSourceChannel(
  supabase: SupabaseClient,
  sourceChannelId: string,
) {
  const allChannels = getAuthoritativeChannels(await loadAllSectorChannels(supabase))
  const matchingChannels = allChannels.filter((channel) => (
    channel.phone_number_id === sourceChannelId
    || channel.instancia === sourceChannelId
  ))
  const sourceSectorIds = new Set(
    matchingChannels.filter((channel) => channel.isNexusSector).map((channel) => channel.setor_id),
  )
  const sourceSectorId = resolveSharedChannelOwnerId(
    matchingChannels.map((channel) => channel.setor_id),
  )

  if (
    !sourceSectorId
    || !sourceSectorIds.has(sourceSectorId)
  ) {
    throw new NexusSessionLinkValidationError(
      sourceSectorIds.size === 0
        ? 'O canal Nexus de origem não foi encontrado.'
        : 'O canal Nexus de origem está vinculado a mais de um setor.',
    )
  }

  const sourceChannelIds = new Set(
    matchingChannels
      .filter((channel) => channel.setor_id === sourceSectorId)
      .flatMap(getChannelIdentifiers),
  )
  const safeSourceChannelIds = getUnambiguousChannelIdentifiers(
    allChannels,
    sourceSectorId,
    sourceChannelIds,
  )
  if (!safeSourceChannelIds.has(sourceChannelId)) {
    throw new NexusSessionLinkValidationError(
      'O canal Nexus de origem está vinculado a mais de um setor.',
    )
  }

  const sourceChannelKey = safeSourceChannelIds.get(sourceChannelId)!
  return {
    sourceSectorId,
    safeSourceChannelIds: new Set(
      [...safeSourceChannelIds]
        .filter(([, channelKey]) => channelKey === sourceChannelKey)
        .map(([identifier]) => identifier),
    ),
  }
}

async function resolveUnambiguousSourceChannelIds(
  supabase: SupabaseClient,
  sourceSectorId: string,
) {
  const allChannels = getAuthoritativeChannels(await loadAllSectorChannels(supabase))
  const sourceChannels = allChannels.filter((channel) => (
    channel.isNexusSector && channel.setor_id === sourceSectorId
  ))
  const sourceIdentifiers = new Set(sourceChannels.flatMap(getChannelIdentifiers))

  if (sourceIdentifiers.size === 0) {
    throw new NexusSessionLinkValidationError('O setor de origem não possui canal Nexus configurado.')
  }

  const unambiguousIdentifiers = getUnambiguousChannelIdentifiers(
    allChannels,
    sourceSectorId,
    sourceIdentifiers,
  )
  if (unambiguousIdentifiers.size === 0) {
    throw new NexusSessionLinkValidationError(
      'Os canais Nexus do setor de origem estão vinculados a mais de um setor.',
    )
  }

  return unambiguousIdentifiers
}

function messageBelongsToClient(
  message: NexusMessageRow,
  allowedClientIdSet: ReadonlySet<string>,
  normalizedClientPhone: string | null,
) {
  const messagePhone = normalizeBrazilianPhone(getClientPhone(message))
  return Boolean(
    (message.cliente_id && allowedClientIdSet.has(message.cliente_id))
    || (normalizedClientPhone && messagePhone === normalizedClientPhone),
  )
}

function getPhoneLookupVariants(phone: string) {
  const trimmedPhone = phone.trim()
  const normalizedPhone = normalizeBrazilianPhone(trimmedPhone)
  if (!normalizedPhone) return [trimmedPhone]

  const nationalPhone = normalizedPhone.startsWith('55')
    ? normalizedPhone.slice(2)
    : normalizedPhone
  const variants = new Set([
    trimmedPhone,
    normalizedPhone,
    `+${normalizedPhone}`,
    nationalPhone,
  ])

  if (nationalPhone.length === 10 || nationalPhone.length === 11) {
    const areaCode = nationalPhone.slice(0, 2)
    const localNumber = nationalPhone.slice(2)
    const prefixLength = localNumber.length === 9 ? 5 : 4
    const formattedLocalNumber = `${localNumber.slice(0, prefixLength)}-${localNumber.slice(prefixLength)}`
    variants.add(`(${areaCode}) ${formattedLocalNumber}`)
    variants.add(`(${areaCode})${formattedLocalNumber}`)
    variants.add(`${areaCode} ${formattedLocalNumber}`)
    variants.add(`${areaCode}${formattedLocalNumber}`)
  }

  return [...variants].filter(Boolean)
}

export async function loadNexusClientScope(
  supabase: SupabaseClient,
  clientId: string,
) {
  const { data: client, error: clientError } = await supabase
    .from('clientes')
    .select('id, telefone')
    .eq('id', clientId)
    .maybeSingle()

  if (clientError) throw clientError
  if (!client) return null

  const normalizedPhone = normalizeBrazilianPhone(client.telefone)
  if (!client.telefone || !normalizedPhone) {
    return { clientId: client.id, clientPhone: client.telefone || null, clientIds: [client.id] }
  }

  const equivalentClients: Array<{ id: string; telefone: string | null }> = []
  for (const phoneChunk of chunkValues(getPhoneLookupVariants(client.telefone), QUERY_CHUNK_SIZE)) {
    const { data, error } = await supabase
      .from('clientes')
      .select('id, telefone')
      .in('telefone', phoneChunk)
    if (error) throw error
    equivalentClients.push(...((data || []) as Array<{ id: string; telefone: string | null }>))
  }

  return {
    clientId: client.id,
    clientPhone: client.telefone,
    clientIds: [...new Set([
      client.id,
      ...equivalentClients
        .filter((candidate) => normalizeBrazilianPhone(candidate.telefone) === normalizedPhone)
        .map((candidate) => candidate.id),
    ])],
  }
}

type SessionScanBudget = {
  count: number
}

async function loadAdjacentNexusMessages({
  supabase,
  sourceChannelIds,
  allowedClientIds,
  since,
  until,
  ascending,
  budget,
}: {
  supabase: SupabaseClient
  sourceChannelIds: readonly string[]
  allowedClientIds: readonly string[]
  since: string
  until: string
  ascending: boolean
  budget: SessionScanBudget
}) {
  const messages: NexusMessageRow[] = []
  let offset = 0

  while (true) {
    const pageSize = Math.min(1000, SESSION_MESSAGE_LIMIT + 1 - budget.count)
    if (pageSize <= 0) {
      throw new NexusSessionLinkValidationError(
        'A sessão Nexus excedeu o limite seguro de mensagens para vínculo.',
      )
    }

    let query = supabase
      .from('mensagens')
      .select('id, cliente_id, enviado_em, phone_number_id, remetente, ticket_id, clientes(telefone)')
      .in('phone_number_id', sourceChannelIds)
      .in('remetente', [...NEXUS_REMETENTES])
      .gte('enviado_em', since)
      .lte('enviado_em', until)
      .order('enviado_em', { ascending })
      .order('id', { ascending })
      .range(offset, offset + pageSize - 1)
    if (allowedClientIds.length > 0) {
      query = query.in('cliente_id', allowedClientIds)
    }

    const { data, error } = await query
    if (error) throw error
    const rows = (data || []) as NexusMessageRow[]
    if (rows.length === 0) break

    messages.push(...rows)
    budget.count += rows.length
    if (budget.count > SESSION_MESSAGE_LIMIT) {
      throw new NexusSessionLinkValidationError(
        'A sessão Nexus excedeu o limite seguro de mensagens para vínculo.',
      )
    }

    offset += rows.length
    if (rows.length < pageSize) break
  }

  return messages
}

async function expandNexusSessionBoundary({
  supabase,
  sourceChannelIds,
  selectedMessageIds,
  allowedClientIdSet,
  normalizedClientPhone,
  targetTicketId,
  boundaryMessageAtMs,
  direction,
  budget,
}: {
  supabase: SupabaseClient
  sourceChannelIds: readonly string[]
  selectedMessageIds: ReadonlySet<string>
  allowedClientIdSet: ReadonlySet<string>
  normalizedClientPhone: string | null
  targetTicketId?: string | null
  boundaryMessageAtMs: number
  direction: 'before' | 'after'
  budget: SessionScanBudget
}) {
  const adjacentMessages: NexusMessageRow[] = []
  const seenIds = new Set(selectedMessageIds)
  let chainCursorMs = boundaryMessageAtMs
  let windowCursorMs = boundaryMessageAtMs
  const nowMs = Date.now()
  const absoluteLimitMs = direction === 'before'
    ? boundaryMessageAtMs - SESSION_BOUNDARY_LIMIT_MS
    : Math.min(nowMs, boundaryMessageAtMs + SESSION_BOUNDARY_LIMIT_MS)

  while (
    direction === 'before'
      ? windowCursorMs > absoluteLimitMs
      : windowCursorMs < absoluteLimitMs
  ) {
    const windowStartMs = direction === 'before'
      ? Math.max(absoluteLimitMs, windowCursorMs - SESSION_SCAN_WINDOW_MS)
      : windowCursorMs
    const windowEndMs = direction === 'before'
      ? windowCursorMs
      : Math.min(absoluteLimitMs, windowCursorMs + SESSION_SCAN_WINDOW_MS)
    const rows = await loadAdjacentNexusMessages({
      supabase,
      sourceChannelIds,
      allowedClientIds: [...allowedClientIdSet],
      since: new Date(windowStartMs).toISOString(),
      until: new Date(windowEndMs).toISOString(),
      ascending: direction === 'after',
      budget,
    })
    let connectedInWindow = false
    let foundBoundary = false

    for (const message of rows) {
      if (seenIds.has(message.id)) continue
      seenIds.add(message.id)
      if (!messageBelongsToClient(message, allowedClientIdSet, normalizedClientPhone)) continue

      const messageAtMs = Date.parse(message.enviado_em)
      if (!Number.isFinite(messageAtMs)) continue
      if (direction === 'before' && messageAtMs > chainCursorMs) continue
      if (direction === 'after' && messageAtMs < chainCursorMs) continue

      const gapMs = direction === 'before'
        ? chainCursorMs - messageAtMs
        : messageAtMs - chainCursorMs
      if (
        gapMs >= NEXUS_NO_TICKET_IDLE_MS
        || (message.ticket_id && message.ticket_id !== targetTicketId)
      ) {
        foundBoundary = true
        break
      }

      adjacentMessages.push(message)
      connectedInWindow = true
      chainCursorMs = messageAtMs
    }

    if (foundBoundary || !connectedInWindow) break

    const distanceToWindowEdgeMs = direction === 'before'
      ? chainCursorMs - windowStartMs
      : windowEndMs - chainCursorMs
    if (distanceToWindowEdgeMs >= NEXUS_NO_TICKET_IDLE_MS) break

    windowCursorMs = direction === 'before' ? windowStartMs : windowEndMs
  }

  if (
    (direction === 'before' && windowCursorMs <= absoluteLimitMs)
    || (direction === 'after' && windowCursorMs >= absoluteLimitMs && absoluteLimitMs < nowMs)
  ) {
    throw new NexusSessionLinkValidationError(
      'Não foi possível confirmar o limite da sessão Nexus em até 31 dias.',
    )
  }

  return adjacentMessages
}

export async function prepareNexusSessionLink({
  supabase,
  messageIds,
  sourceSectorId,
  allowedClientIds,
  clientPhone,
  targetTicketId,
}: {
  supabase: SupabaseClient
  messageIds: readonly string[]
  sourceSectorId: string
  allowedClientIds: readonly string[]
  clientPhone: string | null
  targetTicketId?: string | null
}): Promise<PreparedNexusSession> {
  const normalizedMessageIds = [...new Set(messageIds.filter(Boolean))]
  if (
    normalizedMessageIds.length === 0
    || normalizedMessageIds.length > SESSION_MESSAGE_LIMIT
  ) {
    throw new NexusSessionLinkValidationError('A sessão Nexus informada é inválida.')
  }

  const sourceChannelIds = await resolveUnambiguousSourceChannelIds(
    supabase,
    sourceSectorId,
  )
  const messages: NexusMessageRow[] = []

  for (const idChunk of chunkValues(normalizedMessageIds, QUERY_CHUNK_SIZE)) {
    const { data, error } = await supabase
      .from('mensagens')
      .select('id, cliente_id, enviado_em, phone_number_id, remetente, ticket_id, clientes(telefone)')
      .in('id', idChunk)

    if (error) throw error
    messages.push(...((data || []) as NexusMessageRow[]))
  }

  if (messages.length !== normalizedMessageIds.length) {
    throw new NexusSessionLinkValidationError('Uma ou mais mensagens da sessão não foram encontradas.')
  }

  const allowedClientIdSet = new Set(allowedClientIds.filter(Boolean))
  const normalizedClientPhone = normalizeBrazilianPhone(clientPhone)
  const sortedMessages = messages.sort((first, second) => (
    Date.parse(first.enviado_em) - Date.parse(second.enviado_em)
  ))
  let previousMessageAt = Number.NaN
  let selectedChannelKey: string | null = null

  for (const message of sortedMessages) {
    const messageChannelKey = message.phone_number_id
      ? sourceChannelIds.get(message.phone_number_id)
      : null
    if (
      !messageChannelKey
      || !NEXUS_REMETENTES.has(message.remetente || '')
      || (message.ticket_id && message.ticket_id !== targetTicketId)
    ) {
      throw new NexusSessionLinkValidationError(
        'As mensagens não pertencem a uma sessão Nexus disponível no setor de origem.',
      )
    }
    if (selectedChannelKey && selectedChannelKey !== messageChannelKey) {
      throw new NexusSessionLinkValidationError(
        'As mensagens selecionadas pertencem a canais Nexus diferentes.',
      )
    }
    selectedChannelKey = messageChannelKey

    if (!messageBelongsToClient(message, allowedClientIdSet, normalizedClientPhone)) {
      throw new NexusSessionLinkValidationError(
        'A sessão Nexus não pertence ao cliente informado.',
      )
    }

    const messageAt = Date.parse(message.enviado_em)
    if (
      !Number.isFinite(messageAt)
      || (
        Number.isFinite(previousMessageAt)
        && messageAt - previousMessageAt >= NEXUS_NO_TICKET_IDLE_MS
      )
    ) {
      throw new NexusSessionLinkValidationError(
        'As mensagens informadas não formam uma única sessão Nexus.',
      )
    }
    previousMessageAt = messageAt
    if (message.cliente_id) allowedClientIdSet.add(message.cliente_id)
  }

  const firstMessageAtMs = Date.parse(sortedMessages[0].enviado_em)
  const lastMessageAtMs = Date.parse(sortedMessages[sortedMessages.length - 1].enviado_em)
  const selectedMessageIdSet = new Set(sortedMessages.map((message) => message.id))
  const selectedSourceChannelIds = [...sourceChannelIds]
    .filter(([, channelKey]) => channelKey === selectedChannelKey)
    .map(([identifier]) => identifier)
  const scanBudget: SessionScanBudget = { count: sortedMessages.length }
  const messagesBefore = await expandNexusSessionBoundary({
    supabase,
    sourceChannelIds: selectedSourceChannelIds,
    selectedMessageIds: selectedMessageIdSet,
    allowedClientIdSet,
    normalizedClientPhone,
    targetTicketId,
    boundaryMessageAtMs: firstMessageAtMs,
    direction: 'before',
    budget: scanBudget,
  })
  const messagesAfter = await expandNexusSessionBoundary({
    supabase,
    sourceChannelIds: selectedSourceChannelIds,
    selectedMessageIds: selectedMessageIdSet,
    allowedClientIdSet,
    normalizedClientPhone,
    targetTicketId,
    boundaryMessageAtMs: lastMessageAtMs,
    direction: 'after',
    budget: scanBudget,
  })
  const completeSession = [...new Map(
    [...messagesBefore, ...sortedMessages, ...messagesAfter]
      .map((message) => [message.id, message]),
  ).values()].sort((first, second) => {
    const timestampOrder = Date.parse(first.enviado_em) - Date.parse(second.enviado_em)
    return timestampOrder || first.id.localeCompare(second.id)
  })

  return {
    sourceSectorId,
    messageIds: completeSession.map((message) => message.id),
    pendingMessageIds: completeSession
      .filter((message) => !message.ticket_id)
      .map((message) => message.id),
    alreadyLinkedCount: completeSession.filter((message) => (
      message.ticket_id === targetTicketId
    )).length,
  }
}

type ActiveNexusSessionTicket = {
  id: string
  setor_id: string
  colaborador_id: string | null
}

export async function prepareNexusSessionLinkWithActiveTicket({
  supabase,
  messageIds,
  sourceSectorId,
  allowedClientIds,
  clientPhone,
}: {
  supabase: SupabaseClient
  messageIds: readonly string[]
  sourceSectorId: string
  allowedClientIds: readonly string[]
  clientPhone: string | null
}) {
  const normalizedMessageIds = [...new Set(messageIds.filter(Boolean))]
  if (
    normalizedMessageIds.length === 0
    || normalizedMessageIds.length > SESSION_MESSAGE_LIMIT
  ) {
    throw new NexusSessionLinkValidationError('A sessão Nexus informada é inválida.')
  }

  const linkedTicketIds = new Set<string>()
  for (const idChunk of chunkValues(normalizedMessageIds, QUERY_CHUNK_SIZE)) {
    const { data, error } = await supabase
      .from('mensagens')
      .select('ticket_id')
      .in('id', idChunk)
      .not('ticket_id', 'is', null)

    if (error) throw error
    for (const message of data || []) {
      if (message.ticket_id) linkedTicketIds.add(message.ticket_id)
    }
  }

  const activeTickets: ActiveNexusSessionTicket[] = []
  for (const ticketChunk of chunkValues([...linkedTicketIds], QUERY_CHUNK_SIZE)) {
    const { data, error } = await supabase
      .from('tickets')
      .select('id, setor_id, colaborador_id')
      .in('id', ticketChunk)
      .in('cliente_id', [...new Set(allowedClientIds.filter(Boolean))])
      .in('status', ['aberto', 'em_atendimento'])

    if (error) throw error
    activeTickets.push(...((data || []) as ActiveNexusSessionTicket[]))
  }

  const uniqueActiveTickets = [...new Map(
    activeTickets.map((ticket) => [ticket.id, ticket]),
  ).values()]
  if (uniqueActiveTickets.length > 1) {
    throw new NexusSessionLinkValidationError(
      'A sessão Nexus está vinculada a mais de um ticket ativo.',
    )
  }

  const activeTicket = uniqueActiveTickets[0] || null
  const preparedSession = await prepareNexusSessionLink({
    supabase,
    messageIds: normalizedMessageIds,
    sourceSectorId,
    allowedClientIds,
    clientPhone,
    targetTicketId: activeTicket?.id,
  })

  return { preparedSession, activeTicket }
}

export async function findActiveNexusTicketIdForClientChannel({
  supabase,
  sourceChannelId,
  allowedClientIds,
}: {
  supabase: SupabaseClient
  sourceChannelId: string
  allowedClientIds: readonly string[]
}) {
  const { safeSourceChannelIds } = await resolveSafeNexusSourceChannel(
    supabase,
    sourceChannelId,
  )
  const clientIds = [...new Set(allowedClientIds.filter(Boolean))]
  if (clientIds.length === 0) return null

  for (let page = 0; page * 1000 < SESSION_MESSAGE_LIMIT; page += 1) {
    const from = page * 1000
    const { data, error } = await supabase
      .from('mensagens')
      .select('ticket_id, enviado_em')
      .in('phone_number_id', [...safeSourceChannelIds])
      .in('cliente_id', clientIds)
      .not('ticket_id', 'is', null)
      .in('remetente', [...NEXUS_REMETENTES])
      .order('enviado_em', { ascending: false })
      .range(from, from + 999)

    if (error) throw error
    const rows = (data || []) as Array<{ ticket_id: string | null; enviado_em: string }>
    const ticketIds = [...new Set(
      rows.map((row) => row.ticket_id).filter((ticketId): ticketId is string => Boolean(ticketId)),
    )]
    const activeTicketIds = new Set<string>()

    for (const ticketChunk of chunkValues(ticketIds, QUERY_CHUNK_SIZE)) {
      const { data: tickets, error: ticketsError } = await supabase
        .from('tickets')
        .select('id')
        .in('id', ticketChunk)
        .in('status', ['aberto', 'em_atendimento'])
      if (ticketsError) throw ticketsError
      for (const ticket of tickets || []) activeTicketIds.add(ticket.id)
    }

    const activeMessage = rows.find((row) => (
      row.ticket_id && activeTicketIds.has(row.ticket_id)
    ))
    if (activeMessage?.ticket_id) return activeMessage.ticket_id
    if (rows.length < 1000) break
  }

  return null
}

type PreparePendingNexusSessionLinkArgs = {
  supabase: SupabaseClient
  sourceChannelId: string
  allowedClientIds: readonly string[]
  clientPhone: string | null
  nowMs?: number
}

async function preparePendingNexusSessionLink({
  supabase,
  sourceChannelId,
  allowedClientIds,
  clientPhone,
  nowMs = Date.now(),
  enforceRecency,
}: PreparePendingNexusSessionLinkArgs & {
  enforceRecency: boolean
}): Promise<PreparedNexusSession | null> {
  const { sourceSectorId, safeSourceChannelIds } = await resolveSafeNexusSourceChannel(
    supabase,
    sourceChannelId,
  )
  const allowedClientIdSet = new Set(allowedClientIds.filter(Boolean))
  const normalizedClientPhone = normalizeBrazilianPhone(clientPhone)
  const messages: NexusMessageRow[] = []
  let scannedCount = 0
  let scanLimitReached = false
  let cursor: { enviado_em: string; id: string } | null = null

  while (scannedCount < SESSION_MESSAGE_LIMIT) {
    const pageSize = Math.min(1000, SESSION_MESSAGE_LIMIT - scannedCount)
    let query = supabase
      .from('mensagens')
      .select('id, cliente_id, enviado_em, phone_number_id, remetente, ticket_id, clientes(telefone)')
      .in('phone_number_id', [...safeSourceChannelIds])
      .in('cliente_id', [...allowedClientIdSet])
      .is('ticket_id', null)
      .in('remetente', [...NEXUS_REMETENTES])
      .order('enviado_em', { ascending: false })
      .order('id', { ascending: false })
      .limit(pageSize)

    if (cursor) {
      query = query.or(
        `enviado_em.lt.${cursor.enviado_em},and(enviado_em.eq.${cursor.enviado_em},id.lt.${cursor.id})`,
      )
    }

    const { data, error } = await query

    if (error) throw error
    const rows = (data || []) as NexusMessageRow[]
    scannedCount += rows.length
    messages.push(...rows.filter((message) => (
      messageBelongsToClient(message, allowedClientIdSet, normalizedClientPhone)
    )))
    if (rows.length < pageSize) break
    const lastRow = rows[rows.length - 1]
    cursor = { enviado_em: lastRow.enviado_em, id: lastRow.id }
    if (scannedCount >= SESSION_MESSAGE_LIMIT) scanLimitReached = true
  }

  const latestMessage = messages[0]
  const latestMessageAt = Date.parse(latestMessage?.enviado_em || '')
  if (!latestMessage && scanLimitReached) {
    throw new NexusSessionLinkValidationError(
      'O volume do canal é muito alto para localizar a sessão Nexus com segurança.',
    )
  }
  if (
    !latestMessage
    || (
      enforceRecency
      && (
        !Number.isFinite(nowMs)
        || !Number.isFinite(latestMessageAt)
        || nowMs - latestMessageAt < 0
        || nowMs - latestMessageAt >= NEXUS_NO_TICKET_IDLE_MS
      )
    )
  ) {
    return {
      sourceSectorId,
      messageIds: [],
      pendingMessageIds: [],
      alreadyLinkedCount: 0,
    }
  }

  const sessionMessages: NexusMessageRow[] = []
  let newerMessageAt = Number.NaN
  let foundBoundaryGap = false

  for (const message of messages) {
    const messageAt = Date.parse(message.enviado_em)
    if (!Number.isFinite(messageAt)) continue
    if (
      Number.isFinite(newerMessageAt)
      && newerMessageAt - messageAt >= NEXUS_NO_TICKET_IDLE_MS
    ) {
      foundBoundaryGap = true
      break
    }

    sessionMessages.push(message)
    newerMessageAt = messageAt
  }

  if (!foundBoundaryGap && scanLimitReached) {
    throw new NexusSessionLinkValidationError(
      'A sessão Nexus excedeu o limite seguro de mensagens para vínculo.',
    )
  }

  sessionMessages.reverse()
  return {
    sourceSectorId,
    messageIds: sessionMessages.map((message) => message.id),
    pendingMessageIds: sessionMessages.map((message) => message.id),
    alreadyLinkedCount: 0,
  }
}

export function prepareRecentNexusSessionLink(
  args: PreparePendingNexusSessionLinkArgs,
) {
  return preparePendingNexusSessionLink({ ...args, enforceRecency: true })
}

export function prepareLatestNexusSessionLink(
  args: Omit<PreparePendingNexusSessionLinkArgs, 'nowMs'>,
) {
  return preparePendingNexusSessionLink({ ...args, enforceRecency: false })
}

export async function linkPreparedNexusSessionToTicket({
  supabase,
  messageIds,
  ticketId,
}: {
  supabase: SupabaseClient
  messageIds: readonly string[]
  ticketId: string
}) {
  const normalizedMessageIds = [...new Set(messageIds.filter(Boolean))]
  if (normalizedMessageIds.length === 0) return 0
  if (normalizedMessageIds.length > SESSION_MESSAGE_LIMIT) {
    throw new NexusSessionLinkValidationError(
      'A sessão Nexus excedeu o limite seguro de mensagens para vínculo.',
    )
  }

  const existingTicketIds = new Set<string>()
  let existingMessageCount = 0
  for (const idChunk of chunkValues(normalizedMessageIds, QUERY_CHUNK_SIZE)) {
    const { data, error } = await supabase
      .from('mensagens')
      .select('id, ticket_id')
      .in('id', idChunk)

    if (error) throw error
    existingMessageCount += data?.length || 0
    for (const message of data || []) {
      if (message.ticket_id) existingTicketIds.add(message.ticket_id)
    }
  }

  if (existingMessageCount !== normalizedMessageIds.length) {
    throw new NexusSessionLinkValidationError(
      'Uma ou mais mensagens da sessão não foram encontradas.',
    )
  }
  if (existingTicketIds.size > 1) {
    throw new NexusSessionLinkValidationError(
      'A sessão Nexus já está dividida entre mais de um ticket.',
    )
  }

  const existingTicketId = [...existingTicketIds][0]
  if (existingTicketId && existingTicketId !== ticketId) {
    throw new NexusSessionTicketClaimConflictError(existingTicketId)
  }

  const claimMessageId = normalizedMessageIds[0]
  const { data: claimedMessage, error: claimError } = await supabase
    .from('mensagens')
    .update({ ticket_id: ticketId })
    .eq('id', claimMessageId)
    .is('ticket_id', null)
    .select('ticket_id')
    .maybeSingle()

  if (claimError) throw claimError

  let winnerTicketId = claimedMessage?.ticket_id || null
  if (!winnerTicketId) {
    const { data: currentClaim, error: currentClaimError } = await supabase
      .from('mensagens')
      .select('ticket_id')
      .eq('id', claimMessageId)
      .maybeSingle()

    if (currentClaimError) throw currentClaimError
    winnerTicketId = currentClaim?.ticket_id || null
  }

  if (!winnerTicketId) {
    throw new NexusSessionLinkValidationError(
      'Não foi possível reservar a sessão Nexus para o ticket.',
    )
  }
  if (winnerTicketId !== ticketId) {
    throw new NexusSessionTicketClaimConflictError(winnerTicketId)
  }

  for (const idChunk of chunkValues(normalizedMessageIds, UPDATE_CHUNK_SIZE)) {
    const { error } = await supabase
      .from('mensagens')
      .update({ ticket_id: ticketId })
      .in('id', idChunk)
      .is('ticket_id', null)

    if (error) throw error
  }

  let linkedCount = 0
  for (const idChunk of chunkValues(normalizedMessageIds, QUERY_CHUNK_SIZE)) {
    const { error, count } = await supabase
      .from('mensagens')
      .select('id', { count: 'exact', head: true })
      .in('id', idChunk)
      .eq('ticket_id', ticketId)

    if (error) throw error
    linkedCount += count || 0
  }

  return linkedCount
}

export async function logNexusSectorTransfer({
  supabase,
  ticketId,
  sourceSectorId,
  targetSectorId,
}: {
  supabase: SupabaseClient
  ticketId: string
  sourceSectorId: string
  targetSectorId: string
}) {
  if (sourceSectorId === targetSectorId) return

  const { data: sectors, error } = await supabase
    .from('setores')
    .select('id, nome')
    .in('id', [sourceSectorId, targetSectorId])
  if (error) throw error

  const names = new Map((sectors || []).map((sector) => [sector.id, sector.nome]))
  const sourceName = names.get(sourceSectorId)
  const targetName = names.get(targetSectorId)
  if (!sourceName || !targetName) {
    throw new Error('Setor de origem ou destino não encontrado.')
  }

  const description = `Transferido por Nexus IA: ${sourceName} → ${targetName}`
  const { data: existingLog, error: existingLogError } = await supabase
    .from('ticket_logs')
    .select('id')
    .eq('ticket_id', ticketId)
    .eq('tipo', 'transferencia')
    .eq('descricao', description)
    .limit(1)
    .maybeSingle()
  if (existingLogError) throw existingLogError
  if (existingLog) return

  const { error: logError } = await supabase.from('ticket_logs').insert({
    ticket_id: ticketId,
    tipo: 'transferencia',
    descricao: description,
  })
  if (logError) throw logError
}
