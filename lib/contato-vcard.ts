/**
 * Leitura dos contatos compartilhados via WhatsApp. Dois formatos convivem no
 * banco, ambos gravados com `tipo = 'texto'`:
 *
 *   1) API oficial / Evolution (array): traz os campos já estruturados e ainda
 *      anexa o vCard em BASE64.
 *      [{"name":{"formatted_name":"X"},"phones":[{"phone":"+55…","wa_id":"…"}],"vcard":"QkVHSU46…"}]
 *
 *   2) Evolution (objeto): só `displayName` e o vCard em texto puro.
 *      {"displayName":"X","vcard":"BEGIN:VCARD\n…END:VCARD"}
 *
 *   3) Evolution cru (envelope do Baileys), em duas variantes:
 *      {"contactMessage":{"displayName":"X","vcard":"…"}}
 *      {"contactsArrayMessage":{"contacts":[{"displayName":"X","vcard":"…"}]}}
 *      Essas chegavam com o envelope intacto e o cartão renderizava em branco.
 */

export type ContatoCompartilhado = {
  name: string
  phone: string
}

/**
 * O vCard do formato 1 chega em base64. Sem decodificar, os regex de FN/TEL não
 * acham nada e o contato aparece como "Sem nome" com telefone vazio.
 * TextDecoder em vez de `atob` direto porque os nomes têm acento ("Flávio").
 */
export function decodeVCard(raw: string): string {
  if (raw.includes('BEGIN:VCARD')) return raw
  try {
    const bytes = Uint8Array.from(atob(raw), (char) => char.charCodeAt(0))
    const decoded = new TextDecoder().decode(bytes)
    return decoded.includes('BEGIN:VCARD') ? decoded : raw
  } catch {
    return raw
  }
}

export function parseVCard(vcard: string): ContatoCompartilhado {
  const text = decodeVCard(vcard)
  // Âncoras de linha para não casar no meio de outros campos (X-WA-BIZ-NAME e
  // afins). O prefixo `item1.` aparece nos vCards exportados pelo WhatsApp.
  const fnMatch = text.match(/^FN[;:](.+)$/im)
  const telMatch = text.match(/^(?:item\d+\.)?TEL[^:]*:(.+)$/im)
  return {
    name: fnMatch ? fnMatch[1].trim() : '',
    phone: telMatch ? telMatch[1].trim() : '',
  }
}

/**
 * Separa o payload do texto ao redor. O conteúdo nem sempre é JSON puro: o
 * WorkDesk prefixa a assinatura do atendente ("*Fulano* - ") ao encaminhar, e o
 * cliente pode escrever antes e depois de anexar o contato — nesse caso o
 * recado dele tem que continuar aparecendo, não só o cartão.
 */
function extrairPayload(conteudo: string): { parsed: unknown; texto: string } {
  const trimmed = conteudo.trim()
  try {
    return { parsed: JSON.parse(trimmed), texto: '' }
  } catch {
    // Não é JSON puro; tenta achar o payload no meio do texto.
  }

  const inicio = trimmed.search(/[[{]/)
  if (inicio < 0) return { parsed: null, texto: trimmed }

  const fim = trimmed.lastIndexOf(trimmed[inicio] === '[' ? ']' : '}')
  if (fim <= inicio) return { parsed: null, texto: trimmed }

  try {
    const parsed = JSON.parse(trimmed.slice(inicio, fim + 1))
    const texto = [trimmed.slice(0, inicio), trimmed.slice(fim + 1)]
      .join('\n')
      .split('\n')
      .map((linha) => linha.trim())
      .filter(Boolean)
      .join('\n')
    return { parsed, texto }
  } catch {
    return { parsed: null, texto: trimmed }
  }
}

/** Descasca os envelopes do Baileys até chegar nos contatos em si. */
function achatarItens(parsed: unknown): Record<string, any>[] {
  if (Array.isArray(parsed)) {
    return parsed.flatMap((item) => achatarItens(item))
  }
  if (!parsed || typeof parsed !== 'object') return []

  const raiz = parsed as Record<string, any>
  if (raiz.contactMessage) return achatarItens(raiz.contactMessage)
  if (raiz.contactsArrayMessage) return achatarItens(raiz.contactsArrayMessage.contacts)
  return [raiz]
}

/**
 * Extrai os contatos do conteúdo da mensagem, junto com o texto que os
 * acompanha.
 *
 * Os campos estruturados mandam sobre o vCard: eles vêm prontos do provedor,
 * enquanto o vCard é o anexo bruto. O formato 1 traz os dois, e antes o vCard
 * ganhava — como ele estava em base64, o nome já pronto era descartado e o
 * cartão exibia "Sem nome" com o botão Copiar copiando só "+".
 *
 * `contatos` volta vazio quando o conteúdo não é um contato reconhecível, para
 * o chamador cair no texto puro.
 */
export function parseConteudoContato(conteudo: string): {
  contatos: ContatoCompartilhado[]
  texto: string
} {
  const { parsed, texto } = extrairPayload(conteudo)
  if (parsed === null) return { contatos: [], texto: '' }

  const contatos: ContatoCompartilhado[] = []

  for (const entry of achatarItens(parsed)) {
    const vc = typeof entry.vcard === 'string'
      ? parseVCard(entry.vcard)
      : { name: '', phone: '' }
    const phones = Array.isArray(entry.phones) ? entry.phones : []

    const name = entry.name?.formatted_name
      || entry.name?.first_name
      || entry.displayName
      || vc.name
    const phone = phones[0]?.phone || phones[0]?.wa_id || vc.phone

    if (!name && !phone) continue
    contatos.push({ name: name || 'Sem nome', phone: phone || '' })
  }

  return { contatos, texto: contatos.length > 0 ? texto : '' }
}
