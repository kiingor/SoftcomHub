export const DEFAULT_OPENAI_CHAT_MODEL = 'gpt-4o-mini'
export const DEFAULT_CUSTOM_AI_CHAT_MODEL = 'cx/gpt-5.4'

/** Gateway da Softcom. É para onde o combo dedicado da análise aponta. */
export const OMNIROUTE_BASE_URL = 'https://omniroute.mensageria.softcomtecnologia.com/v1'

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

/** Config de IA de um setor, como vem de `setores`. */
export interface SetorAiConfig {
  openai_ativo?: boolean | null
  openai_api_key?: string | null
  openai_url_personalizada?: boolean | null
  openai_base_url?: string | null
}

/** As variáveis de ambiente do combo dedicado. Separadas para poder testar. */
export interface AnaliseIaEnv {
  ANALISE_IA_API_KEY?: string
  ANALISE_IA_BASE_URL?: string
  ANALISE_IA_MODEL?: string
}

export interface ProvedorDeChat {
  url: string
  apiKey: string
  modelo: string
  /** De onde veio a credencial — vai para o cache e para o log. */
  origem: 'combo' | 'setor'
}

function textoNaoVazio(valor: string | null | undefined): string | null {
  const normalizado = valor?.trim()
  return normalizado ? normalizado : null
}

/**
 * Onde a análise "Status do atendimento" busca o modelo.
 *
 * O COMBO DEDICADO vem primeiro, de propósito. A análise é ferramenta de
 * supervisor, igual em todo setor — não faz sentido cada franquia escolher um
 * modelo para "resuma esta conversa", e exigir chave por setor deixaria a
 * feature morta: em 06/08/2026, 3 dos 30 setores tinham IA ligada com chave, e
 * a do ServiceDesk Matriz Chat respondia 401. Amarrar no setor também
 * penduraria a análise no switch "Ativar Melhoria com IA", que existe para o
 * atendente e não para o supervisor.
 *
 * A config do setor continua valendo como degradação, para quem já tem chave
 * própria e para ambiente sem o combo configurado.
 */
export function resolverProvedorDeChat(
  setor: SetorAiConfig | null | undefined,
  env: AnaliseIaEnv = process.env as AnaliseIaEnv,
): ProvedorDeChat | null {
  const chaveDoCombo = textoNaoVazio(env.ANALISE_IA_API_KEY)
  if (chaveDoCombo) {
    return {
      url: buildAiEndpointUrl(textoNaoVazio(env.ANALISE_IA_BASE_URL) ?? OMNIROUTE_BASE_URL, 'chat/completions'),
      apiKey: chaveDoCombo,
      modelo: textoNaoVazio(env.ANALISE_IA_MODEL) ?? DEFAULT_CUSTOM_AI_CHAT_MODEL,
      origem: 'combo',
    }
  }

  const chaveDoSetor = textoNaoVazio(setor?.openai_api_key)
  if (!setor?.openai_ativo || !chaveDoSetor) return null

  const provedorProprio = Boolean(setor.openai_url_personalizada && textoNaoVazio(setor.openai_base_url))
  return {
    url: provedorProprio
      ? buildAiEndpointUrl(setor.openai_base_url!, 'chat/completions')
      : 'https://api.openai.com/v1/chat/completions',
    apiKey: chaveDoSetor,
    modelo: provedorProprio ? DEFAULT_CUSTOM_AI_CHAT_MODEL : DEFAULT_OPENAI_CHAT_MODEL,
    origem: 'setor',
  }
}
