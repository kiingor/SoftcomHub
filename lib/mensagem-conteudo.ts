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

export function isConteudoProtocolo(conteudo?: string | null): boolean {
  if (!conteudo) return false
  // Só consideramos blob se for um objeto JSON (começa com '{') — evita falso
  // positivo em textos normais que por acaso citem uma dessas palavras.
  if (!conteudo.trimStart().startsWith('{')) return false
  return PROTOCOLO_SIGNATURES.some((sig) => conteudo.includes(`"${sig}"`))
}

export const CONTEUDO_PROTOCOLO_LABEL = 'Mensagem não suportada'
