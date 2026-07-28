// Normalização dos campos do cliente que vêm da sincronização externa
// (Softcom Cloud / n8n) e são gravados em `clientes.software` e `clientes.prime`.
// Os dois chegam como texto livre e com caixa inconsistente no banco
// ("SOFTSHOP" e "Softshop" convivem; prime é a string "true"/"false"), então a
// normalização acontece só na exibição — nada é reescrito no banco.

const SISTEMA_LABELS: Record<string, string> = {
  SOFTSHOP: 'Softshop',
  SOFTCOMSHOP: 'Softcomshop',
  SOFTMOV: 'Softmov',
  MEUCARRINHO: 'Meu Carrinho',
}

function toTitleCase(value: string): string {
  return value
    .toLowerCase()
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

/**
 * Converte o valor cru de `clientes.software` no rótulo exibido.
 * Retorna null quando não há informação — o chamador decide o placeholder.
 */
export function formatSistemaCliente(software: string | null | undefined): string | null {
  const normalized = typeof software === 'string' ? software.trim() : ''
  if (!normalized) return null

  const key = normalized.toUpperCase().replace(/\s+/g, '')
  return SISTEMA_LABELS[key] ?? toTitleCase(normalized)
}

/**
 * Interpreta `clientes.prime`. Retorna null quando o cadastro não informa —
 * ausência de informação não é o mesmo que "não é Prime".
 */
export function isClientePrime(prime: string | boolean | null | undefined): boolean | null {
  if (typeof prime === 'boolean') return prime

  const normalized = typeof prime === 'string' ? prime.trim().toLowerCase() : ''
  if (!normalized) return null

  if (['true', 'sim', 's', '1', 'yes'].includes(normalized)) return true
  if (['false', 'nao', 'não', 'n', '0', 'no'].includes(normalized)) return false
  return null
}

/** Rótulo do campo Prime no painel do cliente. */
export function formatPrimeCliente(prime: string | boolean | null | undefined): string {
  const value = isClientePrime(prime)
  if (value === null) return '—'
  return value ? 'Sim' : 'Não'
}
