// Documento do cliente: CNPJ (14 dígitos) ou CPF (11 dígitos, caso MEI /
// pessoa física). Os dois convivem na MESMA coluna `clientes.CNPJ` — a base já
// tem centenas de cadastros com CPF ali — então tudo que valida ou formata
// documento precisa aceitar os dois tamanhos.
//
// Não há conferência de dígito verificador, de propósito: o CNPJ nunca teve, e
// a base tem cadastros legados fora do padrão que continuariam funcionando.

export type TipoDocumento = 'cpf' | 'cnpj'

const CPF_DIGITS = 11
const CNPJ_DIGITS = 14

/** Extrai apenas os dígitos de qualquer entrada. */
export function normalizeDocumento(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number'
    ? String(value).replace(/\D/g, '')
    : ''
}

export function tipoDocumento(value: unknown): TipoDocumento | null {
  const digits = normalizeDocumento(value)
  if (digits.length === CPF_DIGITS) return 'cpf'
  if (digits.length === CNPJ_DIGITS) return 'cnpj'
  return null
}

/** Aceita apenas CPF ou CNPJ completos — qualquer outro tamanho é inválido. */
export function isDocumentoValido(value: unknown): boolean {
  return tipoDocumento(value) !== null
}

/** Rótulo do tipo, para mensagens ao usuário. */
export function rotuloDocumento(value: unknown): string {
  const tipo = tipoDocumento(value)
  if (tipo === 'cpf') return 'CPF'
  if (tipo === 'cnpj') return 'CNPJ'
  return 'CNPJ/CPF'
}

/**
 * Aplica a máscara de exibição. Documento fora do padrão volta como veio —
 * a base tem registros de 12 e 15 dígitos que não devem virar lixo na tela.
 */
export function formatDocumento(value: string | null | undefined): string {
  if (!value) return ''
  const digits = normalizeDocumento(value)

  if (digits.length === CPF_DIGITS) {
    return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`
  }
  if (digits.length === CNPJ_DIGITS) {
    return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`
  }
  return value
}

/**
 * Máscara progressiva para digitação: enquanto couber em CPF usa o formato de
 * CPF; ao passar de 11 dígitos migra para CNPJ. Nunca aceita mais de 14 dígitos.
 */
export function formatDocumentoInput(value: string): string {
  const digits = normalizeDocumento(value).slice(0, CNPJ_DIGITS)
  if (!digits) return ''

  if (digits.length <= CPF_DIGITS) {
    return digits
      .replace(/^(\d{3})(\d)/, '$1.$2')
      .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
      .replace(/^(\d{3})\.(\d{3})\.(\d{3})(\d)/, '$1.$2.$3-$4')
  }

  return digits
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/^(\d{2})\.(\d{3})\.(\d{3})(\d)/, '$1.$2.$3/$4')
    .replace(/^(\d{2})\.(\d{3})\.(\d{3})\/(\d{4})(\d)/, '$1.$2.$3/$4-$5')
}

/**
 * Formas sob as quais o documento pode estar gravado no banco: só dígitos e
 * com máscara. Usado no `.in('CNPJ', ...)` para não perder cadastro formatado.
 */
export function documentoVariants(value: unknown): string[] {
  const digits = normalizeDocumento(value)
  if (!digits) return []
  const masked = formatDocumento(digits)
  return masked === digits ? [digits] : [digits, masked]
}
