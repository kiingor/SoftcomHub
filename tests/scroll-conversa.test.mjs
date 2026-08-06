import assert from 'node:assert/strict'
import test from 'node:test'
import {
  devePosicionarNoInicioDoTicket,
  estaNoFimDaConversa,
  LIMIAR_FIM_CONVERSA_PX,
} from '../lib/scroll-conversa.ts'

// Conversa de 2000px numa janela de 500px: o fim é scrollTop 1500.
const conversa = (scrollTop) => ({ scrollTop, scrollHeight: 2000, clientHeight: 500 })

test('está no fim quando a rolagem chegou ao final', () => {
  assert.equal(estaNoFimDaConversa(conversa(1500)), true)
})

test('a folga do limiar ainda conta como fim', () => {
  assert.equal(estaNoFimDaConversa(conversa(1500 - LIMIAR_FIM_CONVERSA_PX)), true)
  assert.equal(estaNoFimDaConversa(conversa(1500 - LIMIAR_FIM_CONVERSA_PX + 1)), true)
})

test('um pixel além da folga já não acompanha mais', () => {
  // É este caso que o atendente vive: subiu para reler e não quer ser puxado.
  assert.equal(estaNoFimDaConversa(conversa(1500 - LIMIAR_FIM_CONVERSA_PX - 1)), false)
  assert.equal(estaNoFimDaConversa(conversa(0)), false)
})

test('conteúdo menor que a janela está sempre no fim', () => {
  assert.equal(estaNoFimDaConversa({ scrollTop: 0, scrollHeight: 300, clientHeight: 500 }), true)
  assert.equal(estaNoFimDaConversa({ scrollTop: 0, scrollHeight: 500, clientHeight: 500 }), true)
})

test('sem medida, acompanha — é o estado de quem acabou de abrir a conversa', () => {
  assert.equal(estaNoFimDaConversa(null), true)
  assert.equal(estaNoFimDaConversa(undefined), true)
})

test('medida inválida não trava a conversa no meio', () => {
  assert.equal(estaNoFimDaConversa({ scrollTop: Number.NaN, scrollHeight: 2000, clientHeight: 500 }), true)
  assert.equal(estaNoFimDaConversa({ scrollTop: 0, scrollHeight: Number.POSITIVE_INFINITY, clientHeight: 500 }), true)
})

test('limiar inválido cai no padrão em vez de virar limiar zero', () => {
  assert.equal(estaNoFimDaConversa(conversa(1450), Number.NaN), true)
  assert.equal(estaNoFimDaConversa(conversa(1450), -5), true)
})

test('limiar zero exige o fim exato', () => {
  assert.equal(estaNoFimDaConversa(conversa(1500), 0), true)
  assert.equal(estaNoFimDaConversa(conversa(1499), 0), false)
})

test('rolagem elástica além do fim continua sendo fim', () => {
  // iOS/trackpad pode reportar scrollTop maior que o máximo por um instante.
  assert.equal(estaNoFimDaConversa(conversa(1560)), true)
})

// --- abrir na transição do bot: só na primeira vez ---

test('a primeira abertura do ticket mostra a transição do bot', () => {
  assert.equal(devePosicionarNoInicioDoTicket('t1', new Set()), true)
})

test('trocar de chat e voltar abre no fim, não lá em cima', () => {
  // O caso reportado: o atendente troca para ler a mensagem que chegou e
  // aterrissava no início do ticket, com a mensagem nova fora da tela.
  const jaVistos = new Set(['t1'])

  assert.equal(devePosicionarNoInicioDoTicket('t1', jaVistos), false)
  assert.equal(devePosicionarNoInicioDoTicket('t2', jaVistos), true)
})

test('cada ticket tem a sua primeira vez', () => {
  const jaVistos = new Set()
  for (const id of ['t1', 't2', 't3']) {
    assert.equal(devePosicionarNoInicioDoTicket(id, jaVistos), true, `${id} deveria abrir na transição`)
    jaVistos.add(id)
  }
  for (const id of ['t1', 't2', 't3']) {
    assert.equal(devePosicionarNoInicioDoTicket(id, jaVistos), false, `${id} não deveria repetir`)
  }
})

test('sem ticket selecionado não posiciona nada', () => {
  assert.equal(devePosicionarNoInicioDoTicket(null, new Set()), false)
  assert.equal(devePosicionarNoInicioDoTicket(undefined, new Set()), false)
  assert.equal(devePosicionarNoInicioDoTicket('', new Set()), false)
})
