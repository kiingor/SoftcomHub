import assert from 'node:assert/strict'
import test from 'node:test'
import {
  resumirPorSubsetor,
  formatarEspera,
  SEM_SUBSETOR_CHAVE,
} from '../lib/monitoramento-subsetores.ts'

const AGORA = Date.parse('2026-07-28T12:00:00.000Z')
const NOMES = new Map([['sup', 'Suporte'], ['pri', 'Prime']])
const minutosAtras = (n) => new Date(AGORA - n * 60_000).toISOString()

test('separa os números por subsetor em vez de somar o setor', () => {
  const resumos = resumirPorSubsetor([
    { status: 'aberto', subsetor_id: 'sup', criado_em: minutosAtras(30) },
    { status: 'aberto', subsetor_id: 'sup', criado_em: minutosAtras(5) },
    { status: 'em_atendimento', subsetor_id: 'sup', primeira_resposta_em: minutosAtras(2) },
    { status: 'aberto', subsetor_id: 'pri', criado_em: minutosAtras(3) },
  ], { agoraMs: AGORA, nomePorId: NOMES })

  const suporte = resumos.find((r) => r.subsetorId === 'sup')
  const prime = resumos.find((r) => r.subsetorId === 'pri')

  assert.equal(suporte.naFila, 2)
  assert.equal(suporte.emAtendimento, 1)
  assert.equal(suporte.total, 3)
  assert.equal(prime.naFila, 1)
})

test('a maior espera é a do cliente que está há mais tempo na fila', () => {
  const [resumo] = resumirPorSubsetor([
    { status: 'aberto', subsetor_id: 'sup', criado_em: minutosAtras(7) },
    { status: 'aberto', subsetor_id: 'sup', criado_em: minutosAtras(43) },
    { status: 'aberto', subsetor_id: 'sup', criado_em: minutosAtras(12) },
  ], { agoraMs: AGORA, nomePorId: NOMES })

  assert.equal(resumo.maiorEsperaMs, 43 * 60_000)
})

test('ticket em atendimento sem primeira resposta conta como cliente esperando', () => {
  // É o caso que o total do setor esconde: alguém já pegou o ticket, mas o
  // cliente continua sem resposta.
  const [resumo] = resumirPorSubsetor([
    { status: 'em_atendimento', subsetor_id: 'sup', primeira_resposta_em: null },
    { status: 'em_atendimento', subsetor_id: 'sup', primeira_resposta_em: minutosAtras(1) },
  ], { agoraMs: AGORA, nomePorId: NOMES })

  assert.equal(resumo.emAtendimento, 2)
  assert.equal(resumo.aguardandoResposta, 1)
})

test('tickets sem subsetor viram um grupo próprio, não somem', () => {
  const resumos = resumirPorSubsetor([
    { status: 'aberto', subsetor_id: null, criado_em: minutosAtras(4) },
  ], { agoraMs: AGORA, nomePorId: NOMES })

  assert.equal(resumos.length, 1)
  assert.equal(resumos[0].subsetorId, null)
  assert.equal(resumos[0].nome, 'Sem subsetor')
})

test('subsetor sem nome cadastrado não quebra a linha', () => {
  const [resumo] = resumirPorSubsetor([
    { status: 'aberto', subsetor_id: 'desconhecido', criado_em: minutosAtras(1) },
  ], { agoraMs: AGORA, nomePorId: NOMES })

  assert.equal(resumo.nome, 'Subsetor')
})

test('data inválida ou no futuro não vira espera negativa nem NaN', () => {
  const [resumo] = resumirPorSubsetor([
    { status: 'aberto', subsetor_id: 'sup', criado_em: 'nao-e-data' },
    { status: 'aberto', subsetor_id: 'sup', criado_em: new Date(AGORA + 60_000).toISOString() },
  ], { agoraMs: AGORA, nomePorId: NOMES })

  assert.equal(resumo.naFila, 2)
  assert.equal(resumo.maiorEsperaMs, null)
})

test('quem tem mais gente na fila aparece primeiro — é onde o gestor age', () => {
  const resumos = resumirPorSubsetor([
    { status: 'aberto', subsetor_id: 'pri', criado_em: minutosAtras(2) },
    { status: 'aberto', subsetor_id: 'sup', criado_em: minutosAtras(2) },
    { status: 'aberto', subsetor_id: 'sup', criado_em: minutosAtras(9) },
  ], { agoraMs: AGORA, nomePorId: NOMES })

  assert.deepEqual(resumos.map((r) => r.subsetorId), ['sup', 'pri'])
})

test('empate na fila é desempatado pela maior espera', () => {
  const resumos = resumirPorSubsetor([
    { status: 'aberto', subsetor_id: 'pri', criado_em: minutosAtras(50) },
    { status: 'aberto', subsetor_id: 'sup', criado_em: minutosAtras(2) },
  ], { agoraMs: AGORA, nomePorId: NOMES })

  assert.deepEqual(resumos.map((r) => r.subsetorId), ['pri', 'sup'])
})

test('lista vazia devolve nada, sem inventar subsetor', () => {
  assert.deepEqual(resumirPorSubsetor([], { agoraMs: AGORA, nomePorId: NOMES }), [])
})

test('a soma dos subsetores bate com o total do setor', () => {
  // Se divergir, o card do topo e as faixas se contradizem na mesma tela.
  const tickets = [
    { status: 'aberto', subsetor_id: 'sup', criado_em: minutosAtras(3) },
    { status: 'aberto', subsetor_id: 'pri', criado_em: minutosAtras(3) },
    { status: 'aberto', subsetor_id: null, criado_em: minutosAtras(3) },
    { status: 'em_atendimento', subsetor_id: 'sup' },
    { status: 'encerrado', subsetor_id: 'sup' },
  ]
  const resumos = resumirPorSubsetor(tickets, { agoraMs: AGORA, nomePorId: NOMES })

  const somaFila = resumos.reduce((acc, r) => acc + r.naFila, 0)
  assert.equal(somaFila, tickets.filter((t) => t.status === 'aberto').length)
  assert.equal(resumos.reduce((acc, r) => acc + r.total, 0), tickets.length)
})

test('formata a espera de relance', () => {
  assert.equal(formatarEspera(null), '—')
  assert.equal(formatarEspera(0), '—')
  assert.equal(formatarEspera(3 * 60_000), '3min')
  assert.equal(formatarEspera(59 * 60_000), '59min')
  assert.equal(formatarEspera(60 * 60_000), '1h')
  assert.equal(formatarEspera(72 * 60_000), '1h12')
  assert.equal(formatarEspera(48 * 3_600_000), '2d')
})

test('a chave de "sem subsetor" é estável para o React', () => {
  assert.equal(SEM_SUBSETOR_CHAVE, '__sem_subsetor__')
})
