export type PersistedRecipientResult =
  | { ok: true; phone: string }
  | { ok: false; code: 'RECIPIENT_NOT_FOUND' | 'RECIPIENT_MISMATCH'; error: string }

export type OutboundMediaUrlResult =
  | { ok: true; url: string }
  | { ok: false; code: 'MEDIA_URL_NOT_ALLOWED'; error: string }

/**
 * A citação nunca reprova o envio: no pior caso a mensagem sai sem o quote.
 * `motivoSemQuote` existe só para log — ninguém decide nada com ele.
 */
export type ReplyQuoteResult = {
  providerMessageId: string | null
  motivoSemQuote: 'mensagem-nao-encontrada' | 'consulta-falhou' | 'sem-id-do-provedor' | null
}

export const REPLYABLE_TICKET_SENDERS = [
  'cliente',
  'colaborador',
  'cliente-nexus',
  'bot-nexus',
] as const

/**
 * Remetentes cuja mensagem prova por qual canal a conversa entrou.
 *
 * É a mesma lista que as rotas de envio cobram como evidência histórica, e quem
 * escolhe o canal de saída na tela precisa usar exatamente esta — divergir
 * significa mandar um identificador que o servidor recusa com CHANNEL_MISMATCH.
 */
export const TRUSTED_INBOUND_CLIENT_SENDERS = ['cliente', 'cliente-nexus'] as const

export interface TicketChannelEvidence {
  channelIdentifier: string | null | undefined
  sender: string | null | undefined
  providerMessageId: string | null | undefined
}

interface LegacyWhatsappChannel {
  canal: string | null | undefined
  phone_number_id: string | null | undefined
  whatsapp_token: string | null | undefined
}

interface LegacyEvolutionChannel {
  canal: string | null | undefined
  instancia: string | null | undefined
  phone_number_id: string | null | undefined
  evolution_base_url: string | null | undefined
  evolution_api_key: string | null | undefined
}

interface AuthorizedTicketChannelOptions<T> {
  currentActiveChannels: readonly T[]
  matchingActiveChannels: readonly T[]
  historicalEvidence: readonly TicketChannelEvidence[]
  requestedIdentifier: string | null | undefined
  getIdentifier: (channel: T) => string | null | undefined
  getOwnerId: (channel: T) => string
  resolveOwnerId: (ownerIds: Iterable<string>) => string | null
}

function isTrustedInboundClient(sender: string | null | undefined): boolean {
  return (sender?.toLowerCase().trim() || '').startsWith('cliente')
}

export function isTicketReplySenderAllowed(
  sender: string | null | undefined,
): boolean {
  return REPLYABLE_TICKET_SENDERS.some((candidate) => candidate === sender)
}

/**
 * Remetentes cuja mensagem SAIU por um canal de verdade, e por isso servem de
 * fallback quando o cliente ainda não falou — o caso do ticket de disparo.
 *
 * `supervisor` fica de fora de propósito: nota interna nunca é despachada por
 * canal nenhum, e as 29 dos últimos 30 dias foram gravadas com o
 * `phone_number_id` do Financeiro Matriz por default da coluna. Aceitá-la como
 * prova fez o atendente tentar responder o cliente pelo número errado —
 * ticket #162396, duas falhas seguidas em 12/08/2026.
 *
 * `bot`/`bot-nexus` também ficam de fora: o n8n grava 100% delas com um
 * identificador fixo, independente do canal de entrada.
 */
const OUTBOUND_CHANNEL_FALLBACK_SENDERS = ['colaborador'] as const

/**
 * Escolhe a mensagem que define o canal de saída do ticket.
 *
 * A regra é: só quem trafegou por um canal pode testemunhar sobre ele. A última
 * fala do CLIENTE manda, porque prova por onde a conversa entrou; na falta dela,
 * vale a última do ATENDENTE, que de fato saiu por algum canal.
 *
 * "Última mensagem, qualquer remetente" era a regra antiga e é a origem do
 * CHANNEL_MISMATCH ao responder: `bot-nexus` e `supervisor` carregam um
 * `phone_number_id` fixo que não tem relação com o canal da conversa, e o
 * servidor recusa — `selectAuthorizedTicketChannel` só aceita fala do cliente.
 *
 * `messages` vem ordenado do mais recente para o mais antigo.
 */
export function selectOutboundChannelEvidence<
  T extends { remetente?: string | null },
>(messages: readonly T[]): T | null {
  const normalizar = (remetente: string | null | undefined) => (remetente || '').toLowerCase().trim()
  return messages.find((message) => isTrustedInboundClient(message.remetente))
    ?? messages.find((message) => (
      (OUTBOUND_CHANNEL_FALLBACK_SENDERS as readonly string[]).includes(normalizar(message.remetente))
    ))
    ?? null
}

export function canUseLegacyChannelFallback(
  modernConfigurations: readonly unknown[],
): boolean {
  return modernConfigurations.length === 0
}

export function isConfiguredLegacyWhatsappChannel(
  channel: LegacyWhatsappChannel,
  fallbackAccessToken: string | null | undefined,
): boolean {
  const isExplicitWhatsapp = channel.canal === 'whatsapp'
  const isUnambiguousOldRow = !channel.canal && Boolean(channel.whatsapp_token)
  return Boolean(
    channel.phone_number_id
    && (isExplicitWhatsapp || isUnambiguousOldRow)
    && (channel.whatsapp_token || fallbackAccessToken),
  )
}

export function isConfiguredLegacyEvolutionChannel(
  channel: LegacyEvolutionChannel,
): boolean {
  const hasCredentials = Boolean(
    (channel.instancia || channel.phone_number_id)
    && channel.evolution_base_url
    && channel.evolution_api_key,
  )
  const isExplicitEvolution = channel.canal === 'evolution_api'
  const isUnambiguousOldRow = !channel.canal && hasCredentials
  return hasCredentials && (isExplicitEvolution || isUnambiguousOldRow)
}

export async function readResponseBodyWithLimit(
  response: Response,
  maxBytes: number,
): Promise<ArrayBuffer | null> {
  const declaredLength = Number(response.headers.get('content-length'))
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    return null
  }

  if (!response.body) {
    const body = await response.arrayBuffer()
    return body.byteLength <= maxBytes ? body : null
  }

  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > maxBytes) {
      await reader.cancel()
      return null
    }
    chunks.push(value)
  }

  const body = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    body.set(chunk, offset)
    offset += chunk.byteLength
  }
  return body.buffer
}

function normalizeTargetPhone(raw: string | null | undefined): string {
  const digits = (raw || '').replace(/\D/g, '')
  return digits.length === 10 || digits.length === 11 ? `55${digits}` : digits
}

export function resolvePersistedRecipient(
  ticketPhone: string | null | undefined,
  requestedPhone: string | null | undefined,
): PersistedRecipientResult {
  const authoritativePhone = normalizeTargetPhone(ticketPhone)
  if (!authoritativePhone) {
    return {
      ok: false,
      code: 'RECIPIENT_NOT_FOUND',
      error: 'Telefone do cliente não encontrado no ticket',
    }
  }

  const requested = normalizeTargetPhone(requestedPhone)
  if (requested && requested !== authoritativePhone) {
    return {
      ok: false,
      code: 'RECIPIENT_MISMATCH',
      error: 'O telefone informado não pertence ao cliente deste ticket',
    }
  }

  return { ok: true, phone: authoritativePhone }
}

/**
 * Monta o quote da mensagem citada — e nunca reprova o envio por causa dele.
 *
 * A citação é enfeite; a mensagem é o que importa. Derrubar o envio inteiro
 * porque o quote não pôde ser montado deixava o atendente sem conseguir
 * responder o cliente, e pior: o retry reenvia a mesma citação, então a
 * mensagem encalhava em "falhou" para sempre. Era a MAIOR fonte de falha de
 * envio do sistema — 43 das 76 falhas medidas em 29/07/2026.
 *
 * Os três motivos de não ter quote, e por que nenhum justifica bloquear:
 *
 * - **sem id do provedor**: rotina. As mensagens do Nexus
 *   (`cliente-nexus`/`bot-nexus`) são gravadas 100% sem ele, e 12% das do
 *   cliente também.
 * - **pai não encontrado**: a consulta já restringe por `ticket_id` e por
 *   `REPLYABLE_TICKET_SENDERS`, então some quando a citação aponta para outro
 *   ticket ou para remetente não citável. Nada disso é culpa de quem está
 *   escrevendo agora.
 * - **consulta falhou**: falha transitória de banco não pode custar a resposta
 *   ao cliente.
 *
 * O WorkDesk continua exibindo o trecho citado de qualquer forma — ele monta a
 * partir de `reply_to_message_id`, sem depender do provedor. Só o app do cliente
 * deixa de mostrar a setinha de resposta.
 *
 * Segurança preservada: sem quote não vaza nada. O caminho que buscava o pai é
 * o mesmo, com as mesmas restrições; o que mudou é só o que se faz quando ele
 * volta vazio.
 */
export function resolveReplyQuote(
  parent: { whatsapp_message_id?: string | null } | null | undefined,
  lookupFailed = false,
): ReplyQuoteResult {
  if (lookupFailed) return { providerMessageId: null, motivoSemQuote: 'consulta-falhou' }
  if (!parent) return { providerMessageId: null, motivoSemQuote: 'mensagem-nao-encontrada' }
  if (!parent.whatsapp_message_id) {
    return { providerMessageId: null, motivoSemQuote: 'sem-id-do-provedor' }
  }
  return { providerMessageId: parent.whatsapp_message_id, motivoSemQuote: null }
}

export function selectRequestedActiveChannel<T>(
  channels: readonly T[],
  requestedIdentifier: string | null | undefined,
  getIdentifier: (channel: T) => string | null | undefined,
): T | null {
  if (requestedIdentifier) {
    return channels.find(
      (channel) => getIdentifier(channel) === requestedIdentifier,
    ) ?? null
  }
  return channels[0] ?? null
}

/**
 * Selects an active channel without allowing a caller to inject an arbitrary
 * channel identifier.
 *
 * A channel from the ticket's current sector is authorized directly. A
 * historical channel is authorized only by an inbound client message from the
 * same ticket. The selected global channel must still be active and have one
 * canonical owner; shared Service Desk/Ouvidoria channels are resolved by the
 * caller-provided ownership rule.
 */
export function selectAuthorizedTicketChannel<T>({
  currentActiveChannels,
  matchingActiveChannels,
  historicalEvidence,
  requestedIdentifier,
  getIdentifier,
  getOwnerId,
  resolveOwnerId,
}: AuthorizedTicketChannelOptions<T>): T | null {
  if (!requestedIdentifier) {
    return currentActiveChannels[0] ?? null
  }

  const belongsToCurrentSector = currentActiveChannels.some(
    (channel) => getIdentifier(channel) === requestedIdentifier,
  )
  // A prova de que o canal pertence a esta conversa é a fala do CLIENTE por ele
  // DENTRO DESTE TICKET — quem consulta já restringe por `ticket_id`.
  //
  // Exigir também o id do provedor quebrava o transbordo: quando a fila de uma
  // franquia fica sem atendente, o ticket muda de setor mas o cliente continua
  // falando pela instância de origem, que o novo setor não possui. As mensagens
  // do Evolution frequentemente chegam sem esse id, então a evidência sumia e o
  // atendente ficava impedido de responder — 18 tickets em 28/07/2026.
  const hasTrustedHistory = historicalEvidence.some(
    (evidence) => (
      isTrustedInboundClient(evidence.sender)
      && evidence.channelIdentifier === requestedIdentifier
    ),
  )
  if (!belongsToCurrentSector && !hasTrustedHistory) {
    return null
  }

  const activeMatches = matchingActiveChannels.filter(
    (channel) => getIdentifier(channel) === requestedIdentifier,
  )
  const canonicalOwnerId = resolveOwnerId(
    activeMatches.map((channel) => getOwnerId(channel)),
  )
  if (!canonicalOwnerId) return null

  const canonicalMatches = activeMatches.filter(
    (channel) => getOwnerId(channel) === canonicalOwnerId,
  )
  return canonicalMatches.length === 1 ? canonicalMatches[0] : null
}

function isPrivateIpv4(hostname: string): boolean {
  const octets = hostname.split('.').map(Number)
  if (octets.length !== 4 || octets.some((octet) => !Number.isInteger(octet))) {
    return false
  }
  const [first, second] = octets
  return first === 0
    || first === 10
    || first === 127
    || (first === 100 && second >= 64 && second <= 127)
    || (first === 169 && second === 254)
    || (first === 172 && second >= 16 && second <= 31)
    || (first === 192 && second === 168)
    || first >= 224
}

function isPrivateHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, '')
  return normalized === 'localhost'
    || normalized.endsWith('.localhost')
    || normalized.endsWith('.local')
    || normalized === '::1'
    || normalized.startsWith('fc')
    || normalized.startsWith('fd')
    || normalized.startsWith('fe8')
    || normalized.startsWith('fe9')
    || normalized.startsWith('fea')
    || normalized.startsWith('feb')
    || isPrivateIpv4(normalized)
}

export function validateOutboundMediaUrl(rawUrl: string): OutboundMediaUrlResult {
  try {
    const parsed = new URL(rawUrl)
    const hostname = parsed.hostname.toLowerCase()
    const isVercelPublicBlob = hostname.endsWith(
      '.public.blob.vercel-storage.com',
    )
    if (
      parsed.protocol !== 'https:'
      || isPrivateHostname(hostname)
      || !isVercelPublicBlob
    ) {
      throw new Error('blocked')
    }
    return { ok: true, url: parsed.toString() }
  } catch {
    return {
      ok: false,
      code: 'MEDIA_URL_NOT_ALLOWED',
      error: 'A URL do arquivo não é permitida para envio',
    }
  }
}
