import assert from 'node:assert/strict'
import test from 'node:test'
import { decodeVCard, parseConteudoContato, parseVCard } from '../lib/contato-vcard.ts'

// Payloads copiados de mensagens reais do banco (29/07/2026).
const FORMATO_ARRAY_BASE64 = JSON.stringify([{
  name: { formatted_name: 'Loja Fixo O Rei Das Coxinhas Alhandra' },
  phones: [{ phone: '+55 81 9973-1905', wa_id: '558199731905', type: 'Celular' }],
  vcard: 'QkVHSU46VkNBUkQKVkVSU0lPTjozLjAKTjo7Ozs7CkZOOkxvamEgRml4byBPIFJlaSBEYXMgQ294aW5oYXMgQWxoYW5kcmEKaXRlbTEuVEVMO3dhaWQ9NTU4MTk5NzMxOTA1Ois1NSA4MSA5OTczLTE5MDU=',
}])

const FORMATO_OBJETO_TEXTO = JSON.stringify({
  displayName: 'Barreto',
  vcard: 'BEGIN:VCARD\nVERSION:3.0\nN:;Barreto;;;\nFN:Barreto\nTEL;type=CELL;waid=558499065544:+55 84 9906-5544\nX-WA-BIZ-NAME:Barreto\nEND:VCARD',
})

test('lê o contato do formato em array mesmo com o vCard em base64', () => {
  // Era aqui que quebrava: o vCard vinha em base64, os regex de FN/TEL não
  // achavam nada e o cartão exibia "Sem nome" com o Copiar copiando só "+".
  const { contatos } = parseConteudoContato(FORMATO_ARRAY_BASE64)

  assert.deepEqual(contatos, [{
    name: 'Loja Fixo O Rei Das Coxinhas Alhandra',
    phone: '+55 81 9973-1905',
  }])
})

test('lê o contato do formato em objeto com vCard em texto puro', () => {
  const { contatos } = parseConteudoContato(FORMATO_OBJETO_TEXTO)

  assert.deepEqual(contatos, [{ name: 'Barreto', phone: '+55 84 9906-5544' }])
})

test('cai no vCard quando os campos estruturados não vieram', () => {
  const { contatos } = parseConteudoContato(JSON.stringify([{
    vcard: Buffer.from(
      'BEGIN:VCARD\nVERSION:3.0\nFN:Só No vCard\nitem1.TEL;waid=5511999998888:+55 11 99999-8888\nEND:VCARD',
    ).toString('base64'),
  }]))

  assert.deepEqual(contatos, [{ name: 'Só No vCard', phone: '+55 11 99999-8888' }])
})

test('preserva acentos ao decodificar o vCard em base64', () => {
  const decoded = decodeVCard(
    Buffer.from('BEGIN:VCARD\nFN:Raquel Filha De Flávio\nEND:VCARD').toString('base64'),
  )

  assert.match(decoded, /Flávio/)
})

test('não confunde X-WA-BIZ-NAME com o nome do contato', () => {
  const { name } = parseVCard(
    'BEGIN:VCARD\nVERSION:3.0\nFN:Nome Certo\nX-WA-BIZ-NAME:Nome Comercial\nEND:VCARD',
  )

  assert.equal(name, 'Nome Certo')
})

test('usa o wa_id quando o telefone formatado não veio', () => {
  const { contatos } = parseConteudoContato(JSON.stringify([{
    name: { first_name: 'Fulano' },
    phones: [{ wa_id: '558199731905' }],
  }]))

  assert.deepEqual(contatos, [{ name: 'Fulano', phone: '558199731905' }])
})

test('devolve lista vazia para conteúdo que não é contato', () => {
  assert.deepEqual(parseConteudoContato('mensagem de texto comum').contatos, [])
  assert.deepEqual(parseConteudoContato('{"foo":"bar"}').contatos, [])
  assert.deepEqual(parseConteudoContato('[]').contatos, [])
})

test('mantém o vCard intacto quando o base64 é inválido', () => {
  const raw = 'isso não é base64 válido !!!'

  assert.equal(decodeVCard(raw), raw)
})

test('descasca o envelope contactMessage do Evolution cru', () => {
  // Esses chegavam com o envelope intacto: nenhum contato era extraído e o
  // cartão renderizava em branco.
  const { contatos } = parseConteudoContato(JSON.stringify({
    contactMessage: {
      displayName: 'Patricia Contadora',
      vcard: 'BEGIN:VCARD\nVERSION:3.0\nN:;Patricia Contadora;;;\nFN:Patricia Contadora\nTEL;type=CELL;waid=5511988887777:+55 11 98888-7777\nEND:VCARD',
    },
  }))

  assert.deepEqual(contatos, [{ name: 'Patricia Contadora', phone: '+55 11 98888-7777' }])
})

test('descasca contactsArrayMessage com vários contatos', () => {
  const { contatos } = parseConteudoContato(JSON.stringify({
    contactsArrayMessage: {
      contacts: [
        { displayName: 'Mairy Alves', vcard: 'BEGIN:VCARD\nFN:Mairy Alves\nTEL;waid=5511911112222:+55 11 91111-2222\nEND:VCARD' },
        { displayName: 'Silvana Gomes', vcard: 'BEGIN:VCARD\nFN:Silvana Gomes\nTEL;waid=5511933334444:+55 11 93333-4444\nEND:VCARD' },
      ],
    },
  }))

  assert.deepEqual(contatos, [
    { name: 'Mairy Alves', phone: '+55 11 91111-2222' },
    { name: 'Silvana Gomes', phone: '+55 11 93333-4444' },
  ])
})

test('ignora a assinatura do atendente antes do payload', () => {
  // O WorkDesk prefixa "*Fulano* - " ao encaminhar um contato.
  const payload = JSON.stringify({
    displayName: 'Financeiro Softcom',
    vcard: 'BEGIN:VCARD\nN:;;;;\nFN:Financeiro Softcom\nTEL;waid=5511955556666:+55 11 95555-6666\nEND:VCARD',
  })
  const { contatos } = parseConteudoContato(`*Weder H Leal* - ${payload}`)

  assert.deepEqual(contatos, [{ name: 'Financeiro Softcom', phone: '+55 11 95555-6666' }])
})

test('texto comum com chave solta não vira contato', () => {
  assert.deepEqual(parseConteudoContato('bom dia { tudo bem?').contatos, [])
})

test('preserva o recado escrito antes e depois do contato', () => {
  // Caso real: o cliente pede a troca do número, anexa o contato e completa o
  // pedido embaixo. Renderizar só o cartão apagaria as duas frases dele.
  const payload = JSON.stringify([{
    name: { formatted_name: 'Tok Modas Whatsap' },
    phones: [{ phone: '+55 31 99569-3131', wa_id: '553195693131', type: 'CELL' }],
  }])
  const { contatos, texto } = parseConteudoContato(
    `Bom dia!\nGostaria de trocar o número.\n${payload}\nFavor passar a enviar para esse número. Obrigada`,
  )

  assert.deepEqual(contatos, [{ name: 'Tok Modas Whatsap', phone: '+55 31 99569-3131' }])
  assert.equal(
    texto,
    'Bom dia!\nGostaria de trocar o número.\nFavor passar a enviar para esse número. Obrigada',
  )
})

test('não sobra texto quando o conteúdo é só o contato', () => {
  assert.equal(parseConteudoContato(FORMATO_OBJETO_TEXTO).texto, '')
})
