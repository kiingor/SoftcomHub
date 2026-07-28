// Telefone do cliente para colar em outro sistema.
//
// O número é gravado com DDI (`5583999999999`), formato que o WhatsApp usa.
// Mas quem copia normalmente vai colar num sistema que espera DDD + número,
// e ter que apagar o "55" na mão a cada vez é atrito puro.

const DDI_BRASIL = '55'
// 10 = DDD + 8 dígitos (fixo), 11 = DDD + 9 dígitos (celular).
const TAMANHOS_NACIONAIS = new Set([10, 11])

/**
 * Remove o DDI brasileiro, devolvendo DDD + número.
 *
 * Só remove quando o que sobra tem tamanho de número nacional válido. Um número
 * já sem DDI, ou de outro país que por acaso comece com 55, volta intacto —
 * cortar às cegas transformaria um número certo em outro errado.
 */
export function telefoneSemDDI(telefone: string | null | undefined): string {
  const digitos = (telefone || '').replace(/\D/g, '')
  if (!digitos) return ''

  if (digitos.startsWith(DDI_BRASIL)) {
    const semDDI = digitos.slice(DDI_BRASIL.length)
    if (TAMANHOS_NACIONAIS.has(semDDI.length)) return semDDI
  }

  return digitos
}
