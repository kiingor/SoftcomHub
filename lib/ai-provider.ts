export const DEFAULT_OPENAI_CHAT_MODEL = 'gpt-4o-mini'
export const DEFAULT_CUSTOM_AI_CHAT_MODEL = 'cx/gpt-5.4'

export const DEFAULT_OPENAI_TRANSCRIPTION_MODEL = 'whisper-1'
/**
 * O gateway da Softcom roteia por prefixo de provedor e NÃO tem credencial da
 * OpenAI: pedir 'whisper-1' lá volta 400 "No credentials for provider: openai".
 * Era o modelo fixo da rota de transcrição, então o botão "Transcrever áudio"
 * nunca funcionou em setor com URL personalizada (caso #97520). Verificado em
 * 18/08/2026: 'groq/whisper-large-v3' responde 200 e transcreve em pt-BR.
 */
export const DEFAULT_CUSTOM_AI_TRANSCRIPTION_MODEL = 'groq/whisper-large-v3'

/** Gateway da Softcom. É para onde o combo dedicado da análise aponta. */
export const OMNIROUTE_BASE_URL = 'https://omniroute.mensageria.softcomtecnologia.com/v1'

const KNOWN_ENDPOINT_PATHS = [
  '/chat/completions',
  '/audio/transcriptions',
] as const

export type AiEndpointPath = 'chat/completions' | 'audio/transcriptions' | 'models'

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
  /** Escolhido na tela do setor. Vazio = o padrão do provedor. */
  openai_modelo_chat?: string | null
  openai_modelo_transcricao?: string | null
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

/** O setor aponta para um endpoint próprio (gateway/proxy) em vez da OpenAI? */
export function usaProvedorProprio(setor: SetorAiConfig | null | undefined): boolean {
  return Boolean(setor?.openai_url_personalizada && textoNaoVazio(setor?.openai_base_url))
}

/**
 * Modelo de chat do setor: o escolhido na tela vence; sem escolha, cai no
 * padrão do provedor. Os nomes não são intercambiáveis — 'gpt-4o-mini' só
 * existe na OpenAI e o gateway exige o prefixo do provedor —, por isso o
 * padrão depende de para onde a URL aponta.
 */
export function resolverModeloDeChat(setor: SetorAiConfig | null | undefined): string {
  return (
    textoNaoVazio(setor?.openai_modelo_chat) ??
    (usaProvedorProprio(setor) ? DEFAULT_CUSTOM_AI_CHAT_MODEL : DEFAULT_OPENAI_CHAT_MODEL)
  )
}

/** Mesma regra do chat, para /audio/transcriptions. */
export function resolverModeloDeTranscricao(setor: SetorAiConfig | null | undefined): string {
  return (
    textoNaoVazio(setor?.openai_modelo_transcricao) ??
    (usaProvedorProprio(setor)
      ? DEFAULT_CUSTOM_AI_TRANSCRIPTION_MODEL
      : DEFAULT_OPENAI_TRANSCRIPTION_MODEL)
  )
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

  return {
    url: usaProvedorProprio(setor)
      ? buildAiEndpointUrl(setor.openai_base_url!, 'chat/completions')
      : 'https://api.openai.com/v1/chat/completions',
    apiKey: chaveDoSetor,
    modelo: resolverModeloDeChat(setor),
    origem: 'setor',
  }
}
