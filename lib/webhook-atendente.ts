type MensagemDoWebhook = {
  remetente?: string | null
  atendente_bot?: string | null
}

const MAX_BOT_FIELD_LENGTH = 160

export function normalizarAtendenteBot(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const normalizado = value.trim().slice(0, MAX_BOT_FIELD_LENGTH)
  return normalizado || null
}

/** Devolve o último bot Nexus identificado no atendimento. */
export function resolverAtendenteBotDoWebhook(
  mensagens: readonly MensagemDoWebhook[],
): string | null {
  for (let indice = mensagens.length - 1; indice >= 0; indice -= 1) {
    const mensagem = mensagens[indice]
    if (mensagem.remetente?.trim().toLowerCase() !== 'bot-nexus') continue

    const atendenteBot = normalizarAtendenteBot(mensagem.atendente_bot)
    if (atendenteBot) return atendenteBot
  }

  return null
}
