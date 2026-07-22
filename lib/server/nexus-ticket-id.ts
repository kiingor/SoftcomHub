import { createHash } from 'node:crypto'

const NEXUS_TICKET_ID_NAMESPACE = 'softcomhub:nexus-session-ticket:v1'
const WHATSAPP_INBOUND_MESSAGE_ID_NAMESPACE = 'softcomhub:whatsapp-inbound-message:v1'
const WHATSAPP_INBOUND_TICKET_ID_NAMESPACE = 'softcomhub:whatsapp-inbound-ticket:v1'

function formatUuid(bytes: Buffer) {
  const hex = bytes.toString('hex')
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join('-')
}

function createNamespacedUuid(namespace: string, stableKey: string) {
  const normalizedKey = stableKey.trim()
  if (!normalizedKey) {
    throw new Error('A chave idempotente precisa ser informada.')
  }

  const bytes = createHash('sha256')
    .update(`${namespace}:${normalizedKey}`)
    .digest()
    .subarray(0, 16)

  bytes[6] = (bytes[6] & 0x0f) | 0x50
  bytes[8] = (bytes[8] & 0x3f) | 0x80

  return formatUuid(bytes)
}

export function createNexusSessionTicketId(
  sourceSectorId: string,
  orderedMessageIds: readonly string[],
) {
  const firstMessageId = orderedMessageIds[0]
  if (!firstMessageId) {
    throw new Error('A sessao Nexus precisa ter ao menos uma mensagem.')
  }

  return createNamespacedUuid(
    NEXUS_TICKET_ID_NAMESPACE,
    `${sourceSectorId}:${firstMessageId}`,
  )
}

export function createWhatsappInboundMessageId(providerMessageId: string) {
  return createNamespacedUuid(
    WHATSAPP_INBOUND_MESSAGE_ID_NAMESPACE,
    providerMessageId,
  )
}

export function createWhatsappInboundTicketId(providerMessageId: string) {
  return createNamespacedUuid(
    WHATSAPP_INBOUND_TICKET_ID_NAMESPACE,
    providerMessageId,
  )
}
