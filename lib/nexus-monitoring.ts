export type NexusMessagePhase = 'nexus' | 'human'
export type NexusTicketConversationFilter = 'all' | 'em_conversa' | 'finalizado'

export type NexusTimelineMessage = {
  id: string
  enviado_em: string
}

export type NexusSessionMessage = {
  remetente: string | null | undefined
  enviado_em: string | null | undefined
}

export type NexusTimestampedMessage = {
  enviado_em: string | null | undefined
}

export type NexusSessionOutcome = 'ticket' | 'encerrada_sem_ticket' | null

export type NexusSessionOutcomeInput = {
  messages: readonly NexusSessionMessage[]
  ticketId: string | null | undefined
  nowMs: number
  noTicketIdleMs?: number
}

export type NexusAttendanceSummaryItem = {
  desfecho: 'ticket' | 'encerrada' | 'encerrada_sem_ticket'
}

export type NexusAttendanceSummary = {
  total: number
  tickets: number
  encerradosSemTicket: number
  conversionRate: number
}

export type NexusAggregatesPage<T> = {
  items: T[]
  pageIndex: number
  pageSize: number
  totalItems: number
  totalPages: number
}

type NexusSessionBoundaryInput = {
  hasCurrentSession: boolean
  currentTicketId: string | null
  incomingTicketId: string | null
  gapMs: number
  maxGapMs: number
}

const NEXUS_REMETENTES = new Set(['cliente-nexus', 'bot-nexus'])
const NEXUS_BOT_REMETENTE = 'bot-nexus'

export const NEXUS_NO_TICKET_IDLE_MS = 25 * 60 * 1000
export const NEXUS_ATENDIMENTOS_PAGE_SIZE = 12

const ACTOR_LABELS: Record<string, string> = {
  'cliente-nexus': 'Cliente · Nexus',
  'bot-nexus': 'Nexus IA',
  cliente: 'Cliente',
  colaborador: 'Colaborador',
}

const ATTENDANCE_TYPE_LABELS: Record<string, string> = {
  vendas: 'Vendas',
  notas_nfe_nfce: 'Notas NF-e / NFC-e',
  balanca_etiqueta: 'Balança e etiqueta',
  nota_servico: 'Nota de serviço',
  cadastros: 'Cadastros',
  impressora: 'Impressora',
  sistema_nao_abre: 'Sistema não abre',
  suporte_geral: 'Suporte geral',
  mdfe: 'MDF-e',
  certificado_digital: 'Certificado digital',
}

function normalizeLabel(value: string): string {
  const words = value
    .trim()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase('pt-BR')

  if (!words) return 'Participante'
  return words.charAt(0).toLocaleUpperCase('pt-BR') + words.slice(1)
}

export function getNexusMessagePhase(remetente: string | null | undefined): NexusMessagePhase {
  const normalizedRemetente = remetente?.trim().toLocaleLowerCase('pt-BR') ?? ''
  return NEXUS_REMETENTES.has(normalizedRemetente) ? 'nexus' : 'human'
}

export function getNexusMessageActorLabel(remetente: string | null | undefined): string {
  const normalizedRemetente = remetente?.trim().toLocaleLowerCase('pt-BR') ?? ''
  return ACTOR_LABELS[normalizedRemetente] ?? normalizeLabel(normalizedRemetente)
}

export function formatNexusAttendanceType(value: string | null | undefined): string | null {
  const normalizedValue = value?.trim()
  if (!normalizedValue) return null

  const slug = normalizedValue.toLocaleLowerCase('pt-BR')
  return ATTENDANCE_TYPE_LABELS[slug] ?? normalizeLabel(normalizedValue)
}

export function matchesNexusTicketConversationFilter(
  status: string | null | undefined,
  filter: NexusTicketConversationFilter,
  hasAssignedAttendant = false,
): boolean {
  if (filter === 'all') return true
  if (filter === 'finalizado') return status === 'encerrado'
  return hasAssignedAttendant && (status === 'aberto' || status === 'em_atendimento')
}

export function hasNexusBotResponse(messages: readonly NexusSessionMessage[]): boolean {
  return messages.some((message) => (
    message.remetente?.trim().toLocaleLowerCase('pt-BR') === NEXUS_BOT_REMETENTE
  ))
}

export function isNexusBotRemetente(remetente: string | null | undefined): boolean {
  return remetente?.trim().toLocaleLowerCase('pt-BR') === NEXUS_BOT_REMETENTE
}

/**
 * Setor ao qual a mensagem pertence para fins de agrupamento da conversa.
 *
 * O Nexus é triagem inicial: atende por um número só e encaminha para
 * Financeiro, Suporte, Ouvidoria ou Comercial conforme o caso. Esse número
 * também é canal de atendimento de um setor, então resolver o setor pelo canal
 * do BOT atribuía toda resposta dele àquele setor — e a conversa aparecia
 * partida em duas linhas no painel: a fala do cliente num setor, a resposta do
 * bot em outro. Medido em 27/07/2026: 95 de 117 conversas de 48h duplicadas,
 * com 1.000 de 1.000 mensagens do bot num único canal.
 *
 * A resposta do bot pertence à conversa do cliente, então herda o setor da
 * última fala dele. Sem fala anterior (bot abriu a conversa), cai no canal
 * próprio, que é o comportamento antigo.
 */
export function resolveNexusMessageSector<TSector>(params: {
  remetente: string | null | undefined
  ownSector: TSector | null | undefined
  lastClientSector: TSector | null | undefined
}): TSector | null {
  const { remetente, ownSector, lastClientSector } = params
  if (isNexusBotRemetente(remetente)) return lastClientSector ?? ownSector ?? null
  return ownSector ?? null
}

export type NexusSectorChannel = {
  id: string
  channelKey: string
}

export type NexusScopeAdapter<TMessage, TSector> = {
  getId: (message: TMessage) => string
  getRemetente: (message: TMessage) => string | null | undefined
  getClienteId: (message: TMessage) => string | null | undefined
  /** Telefone do cliente já normalizado, ou null quando não houver. */
  getNormalizedPhone: (message: TMessage) => string | null | undefined
  /** Setor do canal por onde a mensagem entrou, antes da regra do bot. */
  resolveOwnSector: (message: TMessage) => TSector | null | undefined
}

export type NexusScopedMessage<TMessage, TSector> = {
  message: TMessage
  sector: TSector
  clienteId: string | null
  normalizedPhone: string | null
  /** Identidade do cliente independente de canal. */
  clientKey: string
  groupKey: string
}

/**
 * Resolve a que conversa cada mensagem do Nexus pertence.
 *
 * Regra única do painel, compartilhada pela lista "ao vivo" (client) e pelo
 * histórico de atendimentos (server). Enquanto cada lado tinha a sua cópia, os
 * dois divergiram: a correção do bot herdando o setor do cliente foi aplicada
 * só no server, e a lista ao vivo continuou partindo a conversa em duas linhas.
 *
 * As mensagens PRECISAM vir em ordem cronológica crescente — a herança é uma
 * passada só para frente, e uma resposta do bot só sabe de onde veio a fala que
 * está respondendo se essa fala já tiver sido vista.
 *
 * Mensagens sem identidade estável de cliente são descartadas: usar o id da
 * própria mensagem transformaria cada linha numa conversa.
 */
export function resolveNexusConversationScopes<TMessage, TSector extends NexusSectorChannel>(
  messages: readonly TMessage[],
  adapter: NexusScopeAdapter<TMessage, TSector>,
): Array<NexusScopedMessage<TMessage, TSector>> {
  const scopedMessages: Array<NexusScopedMessage<TMessage, TSector>> = []
  const lastClientSectorByClient = new Map<string, TSector>()

  for (const message of messages) {
    const clienteId = adapter.getClienteId(message) ?? null
    const normalizedPhone = adapter.getNormalizedPhone(message) ?? null
    if (!clienteId && !normalizedPhone) continue

    // A chave NÃO leva o canal: é justamente por o bot atender num número
    // diferente do que o cliente usou que os dois lados precisam se encontrar.
    const clientKey = normalizedPhone || clienteId!
    const remetente = adapter.getRemetente(message)
    const sector = resolveNexusMessageSector({
      remetente,
      ownSector: adapter.resolveOwnSector(message),
      lastClientSector: lastClientSectorByClient.get(clientKey) ?? null,
    })
    if (!sector) continue
    if (!isNexusBotRemetente(remetente)) lastClientSectorByClient.set(clientKey, sector)

    scopedMessages.push({
      message,
      sector,
      clienteId,
      normalizedPhone,
      clientKey,
      groupKey: getNexusConversationScopeKey(
        sector.id,
        clienteId,
        normalizedPhone,
        adapter.getId(message),
        sector.channelKey,
      ),
    })
  }

  return scopedMessages
}

export function classifyNexusSessionOutcome({
  messages,
  ticketId,
  nowMs,
  noTicketIdleMs = NEXUS_NO_TICKET_IDLE_MS,
}: NexusSessionOutcomeInput): NexusSessionOutcome {
  if (ticketId) return 'ticket'
  if (!hasNexusBotResponse(messages)) return null

  const lastMessageAt = messages[messages.length - 1]?.enviado_em
  const lastMessageMs = lastMessageAt ? Date.parse(lastMessageAt) : Number.NaN
  const idleMs = nowMs - lastMessageMs

  if (!Number.isFinite(nowMs) || !Number.isFinite(lastMessageMs)) return null
  if (!Number.isFinite(noTicketIdleMs) || noTicketIdleMs < 0) return null
  return idleMs >= noTicketIdleMs ? 'encerrada_sem_ticket' : null
}

export function getLatestNexusSessionMessages<T extends NexusTimestampedMessage>(
  messages: readonly T[],
  maxGapMs = NEXUS_NO_TICKET_IDLE_MS,
): T[] {
  if (messages.length < 2) return [...messages]

  const normalizedMaxGapMs = Number.isFinite(maxGapMs) && maxGapMs > 0
    ? maxGapMs
    : NEXUS_NO_TICKET_IDLE_MS
  let sessionStartIndex = 0

  for (let index = 1; index < messages.length; index += 1) {
    const previousTimestamp = Date.parse(messages[index - 1]?.enviado_em || '')
    const currentTimestamp = Date.parse(messages[index]?.enviado_em || '')
    const gapMs = currentTimestamp - previousTimestamp

    if (!Number.isFinite(gapMs) || gapMs >= normalizedMaxGapMs) {
      sessionStartIndex = index
    }
  }

  return messages.slice(sessionStartIndex)
}

export function summarizeNexusAttendances(
  attendances: readonly NexusAttendanceSummaryItem[],
): NexusAttendanceSummary {
  let tickets = 0
  let encerradosSemTicket = 0

  for (const attendance of attendances) {
    if (attendance.desfecho === 'ticket') tickets += 1
    else encerradosSemTicket += 1
  }

  const total = tickets + encerradosSemTicket
  return {
    total,
    tickets,
    encerradosSemTicket,
    conversionRate: total > 0 ? Math.round((tickets / total) * 100) : 0,
  }
}

export function paginateNexusAggregates<T>(
  items: readonly T[],
  pageIndex: number,
  pageSize = NEXUS_ATENDIMENTOS_PAGE_SIZE,
): NexusAggregatesPage<T> {
  const requestedPageSize = Number.isFinite(pageSize) ? Math.floor(pageSize) : 0
  const normalizedPageSize = requestedPageSize > 0
    ? requestedPageSize
    : NEXUS_ATENDIMENTOS_PAGE_SIZE
  const totalPages = Math.max(1, Math.ceil(items.length / normalizedPageSize))
  const requestedPage = Number.isFinite(pageIndex) ? Math.floor(pageIndex) : 0
  const normalizedPageIndex = Math.min(Math.max(0, requestedPage), totalPages - 1)
  const start = normalizedPageIndex * normalizedPageSize

  return {
    items: items.slice(start, start + normalizedPageSize),
    pageIndex: normalizedPageIndex,
    pageSize: normalizedPageSize,
    totalItems: items.length,
    totalPages,
  }
}

export function getNexusConversationScopeKey(
  sectorId: string,
  clientId: string | null | undefined,
  normalizedPhone: string | null | undefined,
  fallbackId: string,
  channelKey?: string | null,
): string {
  const clientKey = normalizedPhone || clientId || fallbackId
  return channelKey
    ? `${sectorId}::${channelKey}::${clientKey}`
    : `${sectorId}::${clientKey}`
}

export function shouldStartNewNexusSession({
  hasCurrentSession,
  currentTicketId,
  incomingTicketId,
  gapMs,
  maxGapMs,
}: NexusSessionBoundaryInput): boolean {
  if (!hasCurrentSession || gapMs >= maxGapMs) return true

  // Só um ticket DIFERENTE prova que é outra conversa. Mensagem sem ticket não
  // contradiz nada — é apenas não carimbada, e separar contatos é trabalho do
  // intervalo acima.
  //
  // Tratar `null` como fronteira partia a última fala do bot ("Vou te passar
  // pra um técnico"), que sai segundos depois de o n8n vincular o histórico ao
  // ticket e não recebe o carimbo. Ela virava uma sessão à parte, de uma
  // mensagem só, listada como "Encerrada sem ticket" ao lado da conversa real.
  return Boolean(currentTicketId && incomingTicketId && incomingTicketId !== currentTicketId)
}

export function mergeNexusTicketTimeline<
  TNexusMessage extends NexusTimelineMessage,
  TTicketMessage extends NexusTimelineMessage,
>(
  nexusMessages: readonly TNexusMessage[],
  ticketMessages: readonly TTicketMessage[],
): Array<TNexusMessage | TTicketMessage> {
  const messagesById = new Map<string, TNexusMessage | TTicketMessage>()

  for (const message of [...nexusMessages, ...ticketMessages]) {
    if (!messagesById.has(message.id)) messagesById.set(message.id, message)
  }

  return [...messagesById.values()].sort((first, second) => {
    const firstTimestamp = Date.parse(first.enviado_em)
    const secondTimestamp = Date.parse(second.enviado_em)

    if (Number.isNaN(firstTimestamp)) return Number.isNaN(secondTimestamp) ? 0 : 1
    if (Number.isNaN(secondTimestamp)) return -1
    return firstTimestamp - secondTimestamp
  })
}
