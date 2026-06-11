import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Chat alignment helpers. A message belongs to the client side when its
 * remetente starts with "cliente" — this covers both "cliente" and the Nexus
 * bot variant "cliente-nexus". Everything else (colaborador, bot, bot-nexus,
 * supervisor, sistema) is rendered on the support/outgoing side unless a
 * dedicated branch handles it first.
 */
export function isClientMessage(remetente?: string | null) {
  return (remetente?.toLowerCase().trim() || '').startsWith('cliente')
}

/** True for bot messages, including the Nexus "bot-nexus" variant. */
export function isBotMessage(remetente?: string | null) {
  const r = remetente?.toLowerCase().trim() || ''
  return r === 'bot' || r === 'bot-nexus'
}
