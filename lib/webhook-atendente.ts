type MensagemDoWebhook = {
  remetente?: string | null
  atendente_bot?: string | null
  atendente_bot_id?: string | number | null
}

const MAX_BOT_FIELD_LENGTH = 160

/** Identificação do bot Nexus: nome da persona + id estável (ex.: Heitor / 3155). */
export type AtendenteBotDoWebhook = {
  id: string | number | null
  nome: string
}

export function normalizarAtendenteBot(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const normalizado = value.trim().slice(0, MAX_BOT_FIELD_LENGTH)
  return normalizado || null
}

/**
 * O id vem do n8n como inteiro (`3161`), mas aceitamos texto para não depender
 * do tipo da coluna. Preserva o tipo original — é campo novo no payload, não há
 * consumidor antigo esperando string.
 */
export function normalizarAtendenteBotId(value: unknown): string | number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value !== 'string') return null
  const normalizado = value.trim().slice(0, MAX_BOT_FIELD_LENGTH)
  return normalizado || null
}

/**
 * Devolve o último bot Nexus identificado no atendimento.
 *
 * Nome e id saem da MESMA mensagem de propósito: pegar o id de uma linha e o
 * nome de outra faria o webhook anunciar uma persona com o id de outra. Cerca
 * de 8% das linhas antigas têm nome sem id (a coluna `atendente_bot_id` nasceu
 * depois), e nesses casos o id vai nulo em vez de ser adivinhado.
 */
export function resolverAtendenteBotDoWebhook(
  mensagens: readonly MensagemDoWebhook[],
): AtendenteBotDoWebhook | null {
  for (let indice = mensagens.length - 1; indice >= 0; indice -= 1) {
    const mensagem = mensagens[indice]
    if (mensagem.remetente?.trim().toLowerCase() !== 'bot-nexus') continue

    const nome = normalizarAtendenteBot(mensagem.atendente_bot)
    if (!nome) continue

    return { id: normalizarAtendenteBotId(mensagem.atendente_bot_id), nome }
  }

  return null
}
