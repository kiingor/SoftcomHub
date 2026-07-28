import assert from 'node:assert/strict'
import test from 'node:test'
import {
  resumirFila,
  formatarEsperaLonga,
  faixaDeSaude,
  LIMITE_FILA_PADRAO_MIN,
} from '../lib/relatorio-fila.ts'

const AGORA = Date.parse('2026-07-28T18:00:00.000Z')
const min = (n) => new Date(AGORA - n * 60_000).toISOString()
const base = { agoraMs: AGORA }

test('conta quem passou do limite, que é o cliente que esperou demais', () => {
  const r = resumirFila([
    { criado_em: min(20), primeira_resposta_em: min(15) },  // esperou 5min
    { criado_em: min(60), primeira_resposta_em: min(30) },  // esperou 30min
    { criado_em: min(90), primeira_resposta_em: min(20) },  // esperou 70min
  ], base)

  assert.equal(r.total, 3)
  assert.equal(r.acimaDoLimite, 2)
  assert.equal(r.dentroDoLimite, 1)
  assert.equal(r.saudePercentual, 33)
})

test('ticket sem resposta conta a espera até agora — é quem ainda espera', () => {
  const r = resumirFila([{ criado_em: min(45), primeira_resposta_em: null }], base)

  assert.equal(r.acimaDoLimite, 1)
  assert.equal(r.maiorEspera.esperaMs, 45 * 60_000)
  assert.equal(r.maiorEspera.emAndamento, true)
})

test('exatamente no limite não conta como atraso', () => {
  const r = resumirFila([
    { criado_em: min(LIMITE_FILA_PADRAO_MIN), primeira_resposta_em: min(0) },
  ], base)

  assert.equal(r.acimaDoLimite, 0)
  assert.equal(r.saudePercentual, 100)
})

test('a maior espera traz ticket, cliente e entrada', () => {
  const r = resumirFila([
    { numero: 111, criado_em: min(30), primeira_resposta_em: min(25), clientes: { nome: 'ALFA' } },
    { numero: 222, criado_em: min(200), primeira_resposta_em: min(10), clientes: { nome: 'BETA' } },
  ], base)

  assert.equal(r.maiorEspera.ticket, '222')
  assert.equal(r.maiorEspera.cliente, 'BETA')
  assert.equal(r.maiorEspera.esperaMs, 190 * 60_000)
  assert.equal(r.maiorEspera.entradaISO, min(200))
})

test('pico simultâneo conta só quem está acima do limite ao mesmo tempo', () => {
  // Três esperas longas sobrepostas, uma curta fora do limite.
  const r = resumirFila([
    { criado_em: min(120), primeira_resposta_em: min(10) },
    { criado_em: min(110), primeira_resposta_em: min(20) },
    { criado_em: min(100), primeira_resposta_em: min(30) },
    { criado_em: min(5), primeira_resposta_em: min(2) },
  ], base)

  assert.equal(r.picoSimultaneo, 3)
})

test('esperas que não se sobrepõem não viram pico', () => {
  const r = resumirFila([
    { criado_em: min(300), primeira_resposta_em: min(260) },
    { criado_em: min(100), primeira_resposta_em: min(60) },
  ], base)

  assert.equal(r.acimaDoLimite, 2)
  assert.equal(r.picoSimultaneo, 1)
})

test('período sem ticket é saúde 100, não divisão por zero', () => {
  const r = resumirFila([], base)
  assert.equal(r.total, 0)
  assert.equal(r.saudePercentual, 100)
  assert.equal(r.picoSimultaneo, 0)
  assert.equal(r.maiorEspera, null)
})

test('data inválida ou no futuro não entra na conta', () => {
  const r = resumirFila([
    { criado_em: 'nao-e-data', primeira_resposta_em: min(1) },
    { criado_em: null },
    { criado_em: new Date(AGORA + 600_000).toISOString(), primeira_resposta_em: null },
  ], base)

  assert.equal(r.acimaDoLimite, 0)
  assert.equal(r.maiorEspera, null)
})

test('o limite é configurável', () => {
  const tickets = [{ criado_em: min(20), primeira_resposta_em: min(0) }]

  assert.equal(resumirFila(tickets, { ...base, limiteMin: 15 }).acimaDoLimite, 1)
  assert.equal(resumirFila(tickets, { ...base, limiteMin: 30 }).acimaDoLimite, 0)
})

test('formata a espera como o painel de referência', () => {
  assert.equal(formatarEsperaLonga(0), '—')
  assert.equal(formatarEsperaLonga(-1), '—')
  assert.equal(formatarEsperaLonga(45_000), '45s')
  assert.equal(formatarEsperaLonga(125_000), '2min 5s')
  assert.equal(formatarEsperaLonga(33_173_000), '9h 12min 53s')
})

test('faixa de saúde separa boa, atenção e crítica', () => {
  assert.equal(faixaDeSaude(100), 'boa')
  assert.equal(faixaDeSaude(90), 'boa')
  assert.equal(faixaDeSaude(89), 'atencao')
  assert.equal(faixaDeSaude(70), 'atencao')
  assert.equal(faixaDeSaude(69), 'critica')
})
