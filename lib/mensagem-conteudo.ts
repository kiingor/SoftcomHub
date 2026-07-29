/**
 * Detecção de "conteúdo de protocolo" — quando o `conteudo` de uma mensagem é,
 * na verdade, um blob de metadados do protocolo do WhatsApp/Baileys serializado
 * em JSON (messageContextInfo, deviceListMetadata, etc.), e NÃO um texto real.
 *
 * Esses chegam pelo integrador (n8n grava direto / via /api/mensagens/save)
 * quando a mensagem não tem corpo de texto (mensagens de protocolo, efêmeras,
 * device-sync, secret messages). Não devem ser exibidos crus na conversa.
 *
 * Investigado em 2026-06-29: ~567 mensagens com "secretEncType" e ~1052 com
 * "messageContextInfo" num total de ~860k (tipo=texto, remetente=cliente/-nexus,
 * canal_envio=null). O texto começa por '{' e carrega as assinaturas abaixo.
 */

const PROTOCOLO_SIGNATURES = [
  'messageContextInfo',
  'deviceListMetadata',
  'secretEncType',
  'senderKeyHash',
  'messageSecret',
] as const

function comoObjetoJson(conteudo: string): Record<string, unknown> | null {
  if (!conteudo.trimStart().startsWith('{')) return null
  try {
    const valor = JSON.parse(conteudo)
    return valor && typeof valor === 'object' && !Array.isArray(valor)
      ? (valor as Record<string, unknown>)
      : null
  } catch {
    return null
  }
}

/**
 * Anexo que chegou sem corpo — `{"type":"unknown"}`, `{"type":"video_note"}`.
 * A única chave é `type`, então não há texto nenhum a mostrar.
 */
function isStubDeMidia(conteudo: string): boolean {
  const objeto = comoObjetoJson(conteudo)
  if (!objeto) return false
  const chaves = Object.keys(objeto)
  return chaves.length === 1 && chaves[0] === 'type'
}

export function isConteudoProtocolo(conteudo?: string | null): boolean {
  if (!conteudo) return false
  // Só consideramos blob se for um objeto JSON (começa com '{') — evita falso
  // positivo em textos normais que por acaso citem uma dessas palavras.
  if (!conteudo.trimStart().startsWith('{')) return false
  if (isStubDeMidia(conteudo)) return true
  return PROTOCOLO_SIGNATURES.some((sig) => conteudo.includes(`"${sig}"`))
}

export const CONTEUDO_PROTOCOLO_LABEL = 'Mensagem não suportada'

/**
 * O que a mensagem REALMENTE é, quando o `conteudo` não é texto puro.
 *
 * Nem todo JSON que chega no `conteudo` é lixo de protocolo: o cliente
 * apertando um botão e o cliente reagindo com emoji também chegam assim, e
 * apareciam como JSON cru na conversa. Levantamento de 29/07/2026, desde 01/06:
 * 486 respostas de botão, 463 reações e 147 anexos sem corpo — quase mil
 * mensagens legítimas que o atendente não conseguia ler.
 */
export type ConteudoInterpretado =
  | { tipo: 'texto'; texto: string }
  | { tipo: 'botao'; texto: string }
  | { tipo: 'reacao'; emoji: string }
  | { tipo: 'protocolo' }

export function interpretarConteudo(conteudo?: string | null): ConteudoInterpretado {
  if (!conteudo) return { tipo: 'texto', texto: '' }

  const objeto = comoObjetoJson(conteudo)
  if (!objeto) return { tipo: 'texto', texto: conteudo }

  // Resposta de botão: `text` é o rótulo que o cliente viu e apertou.
  const texto = typeof objeto.text === 'string' ? objeto.text.trim() : ''
  if (texto && 'payload' in objeto) return { tipo: 'botao', texto }

  // Reação: o `message_id` aponta a mensagem reagida — hoje só mostramos o
  // emoji, porque casar com a bolha original é outro problema.
  const emoji = typeof objeto.emoji === 'string' ? objeto.emoji.trim() : ''
  if (emoji) return { tipo: 'reacao', emoji }

  if (isConteudoProtocolo(conteudo)) return { tipo: 'protocolo' }

  // JSON que não reconhecemos continua saindo como veio, para não esconder
  // conteúdo real por engano.
  return { tipo: 'texto', texto: conteudo }
}
