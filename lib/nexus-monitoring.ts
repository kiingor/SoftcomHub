export type NexusMessagePhase = 'nexus' | 'human'
export type NexusTicketConversationFilter = 'all' | 'em_conversa' | 'finalizado'

export type NexusTimelineMessage = {
  id: string
  enviado_em: string
}

type NexusSessionBoundaryInput = {
  hasCurrentSession: boolean
  currentTicketId: string | null
  incomingTicketId: string | null
  gapMs: number
  maxGapMs: number
}

const NEXUS_REMETENTES = new Set(['cliente-nexus', 'bot-nexus'])

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
): boolean {
  if (filter === 'all') return true
  if (filter === 'finalizado') return status === 'encerrado'
  return status === 'em_atendimento'
}

export function getNexusConversationScopeKey(
  sectorId: string,
  clientId: string | null | undefined,
  normalizedPhone: string | null | undefined,
  fallbackId: string,
): string {
  return `${sectorId}::${normalizedPhone || clientId || fallbackId}`
}

export function shouldStartNewNexusSession({
  hasCurrentSession,
  currentTicketId,
  incomingTicketId,
  gapMs,
  maxGapMs,
}: NexusSessionBoundaryInput): boolean {
  if (!hasCurrentSession || gapMs > maxGapMs) return true

  // null -> ticket is the same conversation being converted. Once a session
  // already belongs to a ticket, however, a different ticket or a new null
  // message starts another contact and must not be attached to the old ticket.
  return Boolean(currentTicketId && incomingTicketId !== currentTicketId)
}

export function isMissingSupabaseRelation(error: unknown, relation: string): boolean {
  if (!error || typeof error !== 'object') return false
  const databaseError = error as { code?: string; message?: string }
  return databaseError.code === 'PGRST205'
    && Boolean(databaseError.message?.includes(relation))
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
