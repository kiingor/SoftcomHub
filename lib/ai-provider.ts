export const DEFAULT_OPENAI_CHAT_MODEL = 'gpt-4o-mini'
export const DEFAULT_CUSTOM_AI_CHAT_MODEL = 'cx/gpt-5.4'

const KNOWN_ENDPOINT_PATHS = [
  '/chat/completions',
  '/audio/transcriptions',
] as const

export type AiEndpointPath = 'chat/completions' | 'audio/transcriptions'

export function buildAiEndpointUrl(configuredUrl: string, endpointPath: AiEndpointPath): string {
  const url = new URL(configuredUrl.trim())
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('URL da IA inválida')
  }

  const pathname = url.pathname.replace(/\/+$/, '')
  const configuredEndpoint = KNOWN_ENDPOINT_PATHS.find((path) => pathname.endsWith(path))
  const basePath = configuredEndpoint
    ? pathname.slice(0, -configuredEndpoint.length)
    : pathname

  url.hash = ''
  url.pathname = `${basePath}/${endpointPath}`
  return url.toString()
}
