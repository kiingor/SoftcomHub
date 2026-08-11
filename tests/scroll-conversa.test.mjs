import assert from 'node:assert/strict'
import test from 'node:test'
import {
  ABERTURA_DA_CONVERSA,
  estaNoFimDaConversa,
  LIMIAR_FIM_CONVERSA_PX,
  SELETOR_INICIO_DO_TICKET,
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

// --- a conversa abre sempre no fim ---
//
// Existiu uma exceção: ticket vindo do Nexus abria no "início do ticket" na
// primeira vez. Medido em produção, deixava quem abria o chat a 10.889px do fim
// numa conversa de 11.827px. Estes testes travam a remoção dela.

test('a regra declarada é abrir no fim, sem exceção', () => {
  assert.equal(ABERTURA_DA_CONVERSA, 'fim')
})

test('o seletor do marcador continua existindo — ele ainda é separador visual', () => {
  assert.equal(SELETOR_INICIO_DO_TICKET, '[data-ticket-start]')
})

test('nenhuma decisão de abertura sobrou na lib', async () => {
  const lib = await import('../lib/scroll-conversa.ts')
  for (const removida of ['decidirAberturaDaConversa', 'devePosicionarNoInicioDoTicket']) {
    assert.equal(lib[removida], undefined, `${removida} deveria ter sido removida`)
  }
})
