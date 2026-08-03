type ProviderMessage = {
  exists?: boolean
  message?: string
}

export type EvolutionProviderErrorDetails = {
  status: number
  message?: string
  response?: {
    message: ProviderMessage[]
  }
}

export type WhatsAppProviderErrorDetails = {
  status: number
  error?: {
    code?: number
    type?: string
    message?: string
    fbtrace_id?: string
  }
}

export type DatabaseErrorDetails = {
  code?: string
  message: string
}

const MAX_PROVIDER_MESSAGE_LENGTH = 500

const SENSITIVE_KEY_PATTERN = String.raw`(?:[a-z][a-z0-9]*(?:[_-][a-z0-9]+)*[_-])?(?:api[_\s-]?key|apikey|authorization|token|password|senha|secret|key)`
const AUTHORIZATION_KEY_PATTERN = String.raw`(?:[a-z][a-z0-9]*(?:[_-][a-z0-9]+)*[_-])?authorization`
const PASSWORD_KEY_PATTERN = String.raw`(?:[a-z][a-z0-9]*(?:[_-][a-z0-9]+)*[_-])?(?:password|senha)`

// A ordem importa. O padrão de telefone é o mais abrangente e, se rodasse
// primeiro, mutilaria URLs e JIDs — o segredo continuaria legível em volta do
// trecho ocultado. Cada regra específica precisa consumir o valor inteiro antes.
const REDACTIONS: ReadonlyArray<readonly [RegExp, string]> = [
  [/\bbearer\s+[a-z0-9._~+/=-]+/gi, 'Bearer [oculto]'],
  [/\beyJ[a-z0-9_-]{4,}\.[a-z0-9_-]+\.[a-z0-9_-]+/gi, '[token oculto]'],
  // Valores entre aspas podem conter espaços, então precisam ser consumidos
  // por inteiro antes da regra de valores simples.
  [
    new RegExp(
      String.raw`(^|[^a-z0-9_-])(${SENSITIVE_KEY_PATTERN})["']?\s*[:=]\s*(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')`,
      'gim',
    ),
    '$1$2=[oculto]',
  ],
  // `Authorization: Basic <credencial>` não pode esconder apenas o "Basic".
  [
    new RegExp(
      String.raw`(^|[^a-z0-9_-])(${AUTHORIZATION_KEY_PATTERN})["']?\s*[:=]\s*(?:bearer|basic)\s+[^\s,;}\]]+`,
      'gim',
    ),
    '$1$2=[oculto]',
  ],
  // Senhas sem aspas podem ter espaços; até o delimitador é mais seguro
  // ocultar o valor inteiro do que revelar parte dele em um log.
  [
    new RegExp(
      String.raw`(^|[^a-z0-9_-])(${PASSWORD_KEY_PATTERN})["']?\s*[:=]\s*[^,;}\]\r\n]+`,
      'gim',
    ),
    '$1$2=[oculto]',
  ],
  // Cobre `apikey=x`, `API key: x` e credenciais compostas como
  // `whatsapp_token`, `client_secret` e `service_role_key`.
  [
    new RegExp(
      String.raw`(^|[^a-z0-9_-])(${SENSITIVE_KEY_PATTERN})["']?\s*[:=]\s*[^\s,;"'}\]]+`,
      'gim',
    ),
    '$1$2=[oculto]',
  ],
  [
    /(^|[^a-z0-9_-])(api[_\s-]?key|apikey)\s+[^\s,;"'}\]]+/gim,
    '$1$2=[oculto]',
  ],
  [/\b(?:[a-z][a-z0-9+.-]*:\/\/|www\.)[^\s<>"']+/gi, '[url ocultada]'],
  [/\b(?:[a-z0-9-]+\.)+[a-z]{2,}(?::\d{2,5})?\/[^\s<>"']*/gi, '[url ocultada]'],
  // JID do WhatsApp (`5511…@s.whatsapp.net`, `2305…@lid`) carrega o número.
  [/\b\d{5,}@[a-z0-9.-]+\b/gi, '[contato ocultado]'],
  [/\b[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}\b/gi, '[email ocultado]'],
  [/(?:\+?\d{1,3}[\s.-]?)?(?:\(?\d{2,3}\)?[\s.-]?)?\d{4,5}[\s.-]?\d{4}\b/g, '[número ocultado]'],
]

/**
 * Remove credenciais, URLs e dados de contato de um texto livre antes de ele
 * chegar a um log, à resposta HTTP ou à coluna `erro_envio` — que o WorkDesk
 * exibe e o error-logger persiste.
 */
export function redactSensitiveText(value: string): string {
  return REDACTIONS.reduce(
    (text, [pattern, replacement]) => text.replace(pattern, replacement),
    value,
  )
}

/**
 * Descreve um erro inesperado em uma linha, sem stack e sem o que ele carregue
 * de sensível. A classe do erro fica no texto porque é o que orienta a busca.
 */
export function describeUnexpectedError(error: unknown, fallback: string): string {
  if (!(error instanceof Error)) return fallback
  return redactSensitiveText(`${error.name}: ${error.message}`)
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function sanitizeText(value: unknown): string | null {
  if (typeof value !== 'string') return null

  const text = redactSensitiveText(value).trim()

  return text ? text.slice(0, MAX_PROVIDER_MESSAGE_LENGTH) : null
}

function sanitizeProviderMessage(value: unknown): ProviderMessage | null {
  if (typeof value === 'string') {
    const message = sanitizeText(value)
    return message ? { message } : null
  }

  const record = asRecord(value)
  if (!record) return null

  const exists = typeof record.exists === 'boolean' ? record.exists : undefined
  const message = sanitizeText(record.message)
  if (exists === undefined && !message) return null

  return {
    ...(exists === undefined ? {} : { exists }),
    ...(message ? { message } : {}),
  }
}

function getProviderFailureMessage(root: Record<string, unknown> | null): string | null {
  const message = sanitizeText(root?.message)
  if (message && message.toLowerCase() !== 'bad request') return message

  const error = sanitizeText(root?.error)
  return error && error.toLowerCase() !== 'bad request' ? error : null
}

function getProviderMessages(value: unknown): ProviderMessage[] {
  const values = Array.isArray(value) ? value : [value]
  return values
    .map(sanitizeProviderMessage)
    .filter((message): message is ProviderMessage => message !== null)
}

/**
 * Reduz a resposta de erro da Evolution ao mínimo que o atendente precisa ver.
 *
 * É uma allowlist deliberada: só `message`, `error` e `response.message[]`
 * sobrevivem, e ainda passam por redação. Campos como `number`, `remoteJid`,
 * headers ou o eco do payload enviado são descartados por não estarem na lista,
 * então um campo novo do provedor nunca vaza por omissão.
 */
export function sanitizeEvolutionProviderError(
  payload: unknown,
  status: number,
): EvolutionProviderErrorDetails {
  const root = asRecord(payload)
  const response = asRecord(root?.response)
  const messages = getProviderMessages(response?.message)
  const message = getProviderFailureMessage(root)

  return {
    status,
    ...(message ? { message } : {}),
    ...(messages.length > 0 ? { response: { message: messages } } : {}),
  }
}

/**
 * Mesma allowlist para a Cloud API da Meta, preservando o aninhamento `error`
 * que os consumidores já usam para decidir pelo `code`. `error_data`, que é
 * onde a Meta costuma repetir o destinatário, fica de fora.
 */
export function sanitizeWhatsAppProviderError(
  payload: unknown,
  status: number,
): WhatsAppProviderErrorDetails {
  const providerError = asRecord(asRecord(payload)?.error)
  const code = typeof providerError?.code === 'number' ? providerError.code : undefined
  const type = sanitizeText(providerError?.type)
  const message = sanitizeText(providerError?.message)
  const fbtraceId = sanitizeText(providerError?.fbtrace_id)

  const error = {
    ...(code === undefined ? {} : { code }),
    ...(type ? { type } : {}),
    ...(message ? { message } : {}),
    ...(fbtraceId ? { fbtrace_id: fbtraceId } : {}),
  }

  return {
    status,
    ...(Object.keys(error).length > 0 ? { error } : {}),
  }
}

/**
 * O `details` de um erro do PostgREST repete os valores que violaram a
 * restrição — em `clientes` isso é literalmente o telefone do cliente. Só o
 * código e a mensagem (redigida) sobrevivem.
 */
export function sanitizeDatabaseError(error: unknown): DatabaseErrorDetails {
  const record = asRecord(error)
  const code = typeof record?.code === 'string' ? record.code : undefined
  const message = sanitizeText(record?.message) ?? 'Erro não identificado na persistência'

  return {
    ...(code ? { code } : {}),
    message,
  }
}
