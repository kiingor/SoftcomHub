const BRAZIL_COUNTRY_CODE = '55'

export function normalizeBrazilianPhone(raw: string | null | undefined): string {
  const digits = (raw || '').replace(/\D/g, '')

  if (digits.length === 10 || digits.length === 11) {
    return `${BRAZIL_COUNTRY_CODE}${digits}`
  }

  return digits
}
