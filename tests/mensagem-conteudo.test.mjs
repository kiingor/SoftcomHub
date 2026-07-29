import assert from 'node:assert/strict'
import test from 'node:test'
import {
  CONTEUDO_PROTOCOLO_LABEL,
  interpretarConteudo,
  isConteudoProtocolo,
} from '../lib/mensagem-conteudo.ts'

// Payloads reais do banco (levantamento de 29/07/2026, desde 01/06).

test('resposta de botão vira o rótulo que o cliente apertou', () => {
  // 486 ocorrências. Apareciam como JSON cru na conversa.
  const r = interpretarConteudo('{"payload":"Continuar Atendimento","text":"Continuar Atendimento"}')

  assert.deepEqual(r, { tipo: 'botao', texto: 'Continuar Atendimento' })
})

test('reação vira o emoji, não o wamid', () => {
  // 463 ocorrências.
  const r = interpretarConteudo('{"message_id":"wamid.HBgMNTU4MTkyMDM1OTE3FQIAERgSODcwMTE5NDVCNDU2OENFMkI1AA==","emoji":"👍"}')

  assert.deepEqual(r, { tipo: 'reacao', emoji: '👍' })
})

test('anexo sem corpo é protocolo, não texto', () => {
  // 147 ocorrências: {"type":"unknown"} e {"type":"video_note"}.
  assert.equal(interpretarConteudo('{"type":"unknown"}').tipo, 'protocolo')
  assert.equal(interpretarConteudo('{"type":"video_note"}').tipo, 'protocolo')
  assert.equal(isConteudoProtocolo('{"type":"video_note"}'), true)
})

test('blob de protocolo do WhatsApp continua escondido', () => {
  const blob = '{"messageContextInfo":{"deviceListMetadata":{}}}'

  assert.equal(interpretarConteudo(blob).tipo, 'protocolo')
  assert.equal(isConteudoProtocolo(blob), true)
  assert.equal(CONTEUDO_PROTOCOLO_LABEL, 'Mensagem não suportada')
})

test('texto normal passa intacto', () => {
  const r = interpretarConteudo('Bom dia, preciso de ajuda com a nota')

  assert.deepEqual(r, { tipo: 'texto', texto: 'Bom dia, preciso de ajuda com a nota' })
})

test('texto que cita palavra de protocolo não é escondido', () => {
  // A checagem exige objeto JSON justamente para não engolir frase real.
  assert.equal(isConteudoProtocolo('o erro fala em messageContextInfo'), false)
  assert.equal(interpretarConteudo('o erro fala em messageContextInfo').tipo, 'texto')
})

test('JSON desconhecido sai como veio, em vez de sumir', () => {
  // Esconder por padrão arriscaria engolir conteúdo real do cliente.
  const desconhecido = '{"motivo":"Recebimento de comprovante"}'

  assert.deepEqual(interpretarConteudo(desconhecido), { tipo: 'texto', texto: desconhecido })
})

test('contato não é confundido com protocolo', () => {
  // O cartão de contato é tratado antes, mas a lib não pode marcá-lo como lixo.
  const contato = '{"displayName":"Barreto","vcard":"BEGIN:VCARD\nFN:Barreto\nEND:VCARD"}'

  assert.equal(isConteudoProtocolo(contato), false)
  assert.equal(interpretarConteudo(contato).tipo, 'texto')
})

test('conteúdo vazio não quebra', () => {
  assert.deepEqual(interpretarConteudo(null), { tipo: 'texto', texto: '' })
  assert.equal(isConteudoProtocolo(''), false)
})
