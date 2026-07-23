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
