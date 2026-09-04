const BRAZIL_COUNTRY_CODE = '55'

export function normalizeBrazilianPhone(raw: string | null | undefined): string {
  const digits = (raw || '').replace(/\D/g, '')

  if (digits.length === 10 || digits.length === 11) {
    return `${BRAZIL_COUNTRY_CODE}${digits}`
  }

  return digits
}

// Inverso de normalizeBrazilianPhone: remove o DDI 55 quando presente, mantendo
// DDD + número. Só remove quando o total de dígitos bate com "55 + DDD + número"
// (12 ou 13 dígitos) — evita cortar por engano um número que já esteja sem DDI
// (ex: DDD 55 de Rio Grande do Sul, que sozinho tem 10 ou 11 dígitos).
export function stripBrazilCountryCode(raw: string | null | undefined): string {
  const digits = (raw || '').replace(/\D/g, '')
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith(BRAZIL_COUNTRY_CODE)) {
    return digits.slice(BRAZIL_COUNTRY_CODE.length)
  }
  return digits
}

// Faixa inicial de celular no Brasil. Fixo começa em 2–5, celular em 6–9 — é o
// que separa "faltou o nono dígito" de "isso é um fixo de 8 dígitos mesmo".
const PRIMEIRO_DIGITO_CELULAR = /^[6-9]$/

/**
 * As formas sob as quais o MESMO WhatsApp pode estar cadastrado.
 *
 * O celular brasileiro circula com e sem o nono dígito e `normalizeBrazilianPhone`
 * não completa o que falta. Em 04/09/2026 isso partiu um cliente em dois
 * cadastros: o disparo do ServiceDesk saiu para 558388330154 e o cliente
 * respondia de 5583988330154 — mesmo aparelho, dois `clientes.id`. Quem
 * precisa de "todos os tickets deste cliente" tem de procurar pelas duas formas,
 * porque casar por `cliente_id` perde exatamente esse caso.
 *
 * Devolve com DDI, sem repetição, com a forma normalizada na frente.
 */
export function variantesDeTelefoneBR(raw: string | null | undefined): string[] {
  const nacional = stripBrazilCountryCode(raw)

  // Fora de "DDD + número" não há o que deduzir: devolve o que veio, se veio algo.
  if (nacional.length !== 10 && nacional.length !== 11) {
    return nacional ? [nacional] : []
  }

  const ddd = nacional.slice(0, 2)
  const local = nacional.slice(2)
  const variantes = [nacional]

  if (local.length === 9 && local[0] === '9') {
    variantes.push(`${ddd}${local.slice(1)}`)
  } else if (local.length === 8 && PRIMEIRO_DIGITO_CELULAR.test(local[0])) {
    variantes.push(`${ddd}9${local}`)
  }

  return [...new Set(variantes.map((v) => `${BRAZIL_COUNTRY_CODE}${v}`))]
}
