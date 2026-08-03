export type WhatsAppProviderFailureCode =
  | 'WHATSAPP_RECIPIENT_INVALID'
  | 'WHATSAPP_RECIPIENT_UNAVAILABLE'
  | 'WHATSAPP_24H_WINDOW_EXPIRED'
  | 'WHATSAPP_CONTENT_INVALID'
  | 'WHATSAPP_TOKEN_INVALID'
  | 'WHATSAPP_CHANNEL_UNAUTHORIZED'
  | 'WHATSAPP_CHANNEL_UNAVAILABLE'
  | 'WHATSAPP_RATE_LIMITED'
  | 'WHATSAPP_PROVIDER_UNAVAILABLE'
  | 'WHATSAPP_PROVIDER_SEND_FAILED'

export type WhatsAppProviderFailure = {
  code: WhatsAppProviderFailureCode
  error: string
  status: number
}

export type WhatsAppProviderAcceptance = {
  messageId: string | null
  hasValidatedRecipient: boolean
}

const CONTENT_ERROR_CODES = new Set([
  100,
  131008,
  131009,
  131051,
  131052,
  131053,
  132000,
  132001,
  132005,
  132007,
  132012,
  132015,
  132016,
])
const RATE_LIMIT_ERROR_CODES = new Set([4, 130429, 131048, 131056, 80007])
const CHANNEL_UNAVAILABLE_ERROR_CODES = new Set([
  368,
  131031,
  131037,
  131042,
  131045,
  133010,
])
const PROVIDER_UNAVAILABLE_ERROR_CODES = new Set([131000, 131016, 131017])
const VALID_WA_ID = /^[1-9]\d{6,14}$/

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function readText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function readErrorCode(value: unknown): number | null {
  if (typeof value === 'number' && Number.isInteger(value)) return value
  if (typeof value === 'string' && /^\d{1,9}$/.test(value)) return Number(value)
  return null
}

function normalizeStatus(status: number): number {
  return Number.isInteger(status) && status >= 400 && status < 600 ? status : 502
}

function readMetaError(payload: unknown) {
  const error = asRecord(asRecord(payload)?.error)
  const errorData = asRecord(error?.error_data)
  const text = [error?.message, errorData?.details]
    .map(readText)
    .find(Boolean) || ''

  return { code: readErrorCode(error?.code), text }
}

function hasRecipientHint(text: string): boolean {
  return /recipient|phone(?:\s*number)?|destination|not registered|allowed list/i.test(text)
}

function createFailure(
  code: WhatsAppProviderFailureCode,
  error: string,
  status: number,
): WhatsAppProviderFailure {
  return { code, error, status: normalizeStatus(status) }
}

/**
 * Converts known Meta failures into a stable, non-sensitive contract for the
 * WorkDesk. Provider messages and error_data are inspected only to classify a
 * generic parameter error; they are never returned or persisted.
 */
export function mapWhatsAppProviderError(
  payload: unknown,
  providerStatus: number,
): WhatsAppProviderFailure {
  const { code, text } = readMetaError(payload)

  if (code === 190 || providerStatus === 401) {
    return createFailure(
      'WHATSAPP_TOKEN_INVALID',
      'O token do WhatsApp Oficial esta invalido ou expirado.',
      providerStatus,
    )
  }
  if (
    code === 10
    || code === 200
    || code === 131005
    || code === 131010
    || providerStatus === 403
  ) {
    return createFailure(
      'WHATSAPP_CHANNEL_UNAUTHORIZED',
      'O canal Oficial nao tem permissao para enviar mensagens.',
      providerStatus,
    )
  }
  if (CHANNEL_UNAVAILABLE_ERROR_CODES.has(code ?? -1) || providerStatus === 404) {
    return createFailure(
      'WHATSAPP_CHANNEL_UNAVAILABLE',
      'O canal Oficial esta indisponivel ou nao esta configurado na Meta.',
      providerStatus,
    )
  }
  if (code === 131047) {
    return createFailure(
      'WHATSAPP_24H_WINDOW_EXPIRED',
      'A janela de 24 horas expirou. Envie um template aprovado para retomar o contato.',
      providerStatus,
    )
  }
  if (code === 131021 || code === 131026 || code === 131030) {
    return createFailure(
      'WHATSAPP_RECIPIENT_UNAVAILABLE',
      'O destinatario esta indisponivel para receber mensagens neste canal.',
      providerStatus,
    )
  }
  if ((code === 100 || code === 131009) && hasRecipientHint(text)) {
    return createFailure(
      'WHATSAPP_RECIPIENT_INVALID',
      'O numero do destinatario e invalido para o WhatsApp Oficial.',
      providerStatus,
    )
  }
  if (CONTENT_ERROR_CODES.has(code ?? -1)) {
    return createFailure(
      'WHATSAPP_CONTENT_INVALID',
      'O conteudo da mensagem nao e aceito pelo WhatsApp Oficial.',
      providerStatus,
    )
  }
  if (RATE_LIMIT_ERROR_CODES.has(code ?? -1) || providerStatus === 429) {
    return createFailure(
      'WHATSAPP_RATE_LIMITED',
      'O limite de envios do WhatsApp Oficial foi atingido. Aguarde e tente novamente.',
      providerStatus,
    )
  }
  if (PROVIDER_UNAVAILABLE_ERROR_CODES.has(code ?? -1) || providerStatus >= 500) {
    return createFailure(
      'WHATSAPP_PROVIDER_UNAVAILABLE',
      'O provedor do WhatsApp Oficial esta indisponivel. Tente novamente.',
      providerStatus,
    )
  }

  return createFailure(
    'WHATSAPP_PROVIDER_SEND_FAILED',
    'Nao foi possivel enviar a mensagem pelo WhatsApp Oficial.',
    providerStatus,
  )
}

/**
 * A Meta message ID proves provider acceptance. A contacts[].wa_id is only a
 * validated recipient-resolution signal and is intentionally never exposed.
 */
export function getWhatsAppProviderAcceptance(
  payload: unknown,
): WhatsAppProviderAcceptance {
  const root = asRecord(payload)
  const message = Array.isArray(root?.messages) ? asRecord(root.messages[0]) : null
  const messageId = readText(message?.id)
  const contact = Array.isArray(root?.contacts) ? asRecord(root.contacts[0]) : null
  const waId = readText(contact?.wa_id)
  const hasMessageId = messageId.length > 0 && messageId.length <= 1024

  return {
    messageId: hasMessageId ? messageId : null,
    hasValidatedRecipient: hasMessageId && VALID_WA_ID.test(waId),
  }
}
