import assert from 'node:assert/strict'
import test from 'node:test'
import { resolverUltimaMensagem, rotuloDeQuemFalou } from '../lib/ultima-mensagem.ts'
import { isBotMessage, isClientMessage } from '../lib/utils.ts'

const msg = (remetente, enviado_em) => ({ remetente, enviado_em })

test('pega a mensagem mais recente da conversa', () => {
  const ultima = resolverUltimaMensagem([
    msg('cliente', '2026-08-11T10:00:00Z'),
    msg('colaborador', '2026-08-11T10:05:00Z'),
  ])
  assert.equal(ultima.enviadoEm, '2026-08-11T10:05:00Z')
  assert.equal(ultima.quem, 'atendente')
})

// A conversa é costurada com o histórico do Nexus e já veio fora de ordem.
// Confiar no último item do array daria o tempo errado, sem sinal nenhum.
test('não confia na ordem do array', () => {
  const ultima = resolverUltimaMensagem([
    msg('colaborador', '2026-08-11T10:05:00Z'),
    msg('cliente', '2026-08-11T10:30:00Z'),
    msg('bot-nexus', '2026-08-11T09:00:00Z'),
  ])
  assert.equal(ultima.enviadoEm, '2026-08-11T10:30:00Z')
  assert.equal(ultima.quem, 'cliente')
})

test('cliente-nexus conta como cliente', () => {
  assert.equal(resolverUltimaMensagem([msg('cliente-nexus', '2026-08-11T10:00:00Z')]).quem, 'cliente')
})

test('bot-nexus conta como bot', () => {
  assert.equal(resolverUltimaMensagem([msg('bot-nexus', '2026-08-11T10:00:00Z')]).quem, 'bot')
})

test('sistema não é confundido com atendente', () => {
  assert.equal(resolverUltimaMensagem([msg('sistema', '2026-08-11T10:00:00Z')]).quem, 'sistema')
})

// Chutar `agora` mostraria "há 0min" numa conversa parada — o oposto do que o
// painel existe para denunciar.
test('mensagem sem instante é ignorada, não vira agora', () => {
  const ultima = resolverUltimaMensagem([
    msg('cliente', '2026-08-11T10:00:00Z'),
    msg('colaborador', null),
  ])
  assert.equal(ultima.enviadoEm, '2026-08-11T10:00:00Z')
  assert.equal(ultima.quem, 'cliente')
})

test('data inválida é ignorada', () => {
  const ultima = resolverUltimaMensagem([
    msg('cliente', '2026-08-11T10:00:00Z'),
    msg('colaborador', 'nao-e-data'),
  ])
  assert.equal(ultima.enviadoEm, '2026-08-11T10:00:00Z')
})

test('conversa vazia devolve null em vez de inventar', () => {
  assert.equal(resolverUltimaMensagem([]), null)
  assert.equal(resolverUltimaMensagem(null), null)
  assert.equal(resolverUltimaMensagem(undefined), null)
  assert.equal(resolverUltimaMensagem([msg('cliente', null)]), null)
})

// `lib/ultima-mensagem.ts` repete a regra de remetente porque não pode importar
// `lib/utils` (o runner exige extensão `.ts`, o tsc a proíbe). Este teste é o
// que impede as duas cópias de divergirem — foi exatamente uma divergência
// dessas que fez `cliente-nexus` ser ignorado em cinco pontos do WorkDesk.
test('a classificação daqui concorda com isClientMessage/isBotMessage', () => {
  const remetentes = [
    'cliente', 'cliente-nexus', 'CLIENTE', ' cliente-widget ',
    'colaborador', 'supervisor', 'bot', 'bot-nexus', 'sistema', '',
  ]
  for (const remetente of remetentes) {
    const quem = resolverUltimaMensagem([msg(remetente, '2026-08-11T10:00:00Z')]).quem
    assert.equal(
      quem === 'cliente',
      isClientMessage(remetente),
      `divergência de cliente em "${remetente}"`,
    )
    assert.equal(
      quem === 'bot',
      isBotMessage(remetente),
      `divergência de bot em "${remetente}"`,
    )
  }
})

test('rótulos distinguem quem está esperando', () => {
  assert.equal(rotuloDeQuemFalou('cliente'), 'do cliente')
  assert.equal(rotuloDeQuemFalou('atendente'), 'do atendente')
  assert.equal(rotuloDeQuemFalou('bot'), 'do Nexus')
  assert.equal(rotuloDeQuemFalou('sistema'), 'do sistema')
})
