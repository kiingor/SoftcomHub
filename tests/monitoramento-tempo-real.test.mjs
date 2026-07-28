import assert from 'node:assert/strict'
import test from 'node:test'
import { calcularTempoReal, formatarTempoMonitoramento } from '../lib/monitoramento-tempo-real.ts'

const AGORA = Date.parse('2026-07-28T12:00:00.000Z')
const minAtras = (n) => new Date(AGORA - n * 60_000).toISOString()

const base = {
  ticketsDeHoje: [],
  atendentes: [],
  aceitaTicket: () => true,
  aceitaAtendente: () => true,
  agoraMs: AGORA,
}

test('conta ativos, fila e em atendimento', () => {
  const r = calcularTempoReal({
    ...base,
    tickets: [
      { status: 'aberto', criado_em: minAtras(5) },
      { status: 'aberto', criado_em: minAtras(20) },
      { status: 'em_atendimento', criado_em: minAtras(30), primeira_resposta_em: minAtras(28) },
      { status: 'encerrado', criado_em: minAtras(90) },
    ],
  })

  assert.equal(r.total, 4)
  assert.equal(r.naFila, 2)
  assert.equal(r.emAtendimento, 1)
})

test('finalizados hoje vem da lista do dia, não dos ativos', () => {
  const r = calcularTempoReal({
    ...base,
    tickets: [{ status: 'aberto', criado_em: minAtras(1) }],
    ticketsDeHoje: [
      { status: 'encerrado' },
      { status: 'encerrado' },
      { status: 'aberto' },
    ],
  })

  assert.equal(r.finalizadosHoje, 2)
})

test('maior espera na fila é a do cliente mais antigo aguardando', () => {
  const r = calcularTempoReal({
    ...base,
    tickets: [
      { status: 'aberto', criado_em: minAtras(3) },
      { status: 'aberto', criado_em: minAtras(41) },
    ],
  })

  assert.equal(r.maiorEsperaFilaMs, 41 * 60_000)
})

test('espera por resposta só conta quem ainda não recebeu a primeira', () => {
  const r = calcularTempoReal({
    ...base,
    tickets: [
      { status: 'em_atendimento', criado_em: minAtras(50), primeira_resposta_em: minAtras(49) },
      { status: 'em_atendimento', criado_em: minAtras(12), primeira_resposta_em: null },
    ],
  })

  assert.equal(r.maiorEsperaRespostaMs, 12 * 60_000)
})

test('data inválida ou no futuro não vira espera negativa nem NaN', () => {
  const r = calcularTempoReal({
    ...base,
    tickets: [
      { status: 'aberto', criado_em: 'nao-e-data' },
      { status: 'aberto', criado_em: new Date(AGORA + 600_000).toISOString() },
      { status: 'aberto', criado_em: null },
    ],
  })

  assert.equal(r.naFila, 3)
  assert.equal(r.maiorEsperaFilaMs, 0)
})

test('o filtro separa subsetores e a soma fecha com o total', () => {
  // É a garantia que impede o card do setor e os cards por subsetor de se
  // contradizerem na mesma tela.
  const tickets = [
    { status: 'aberto', subsetor_id: 'sup', criado_em: minAtras(2) },
    { status: 'aberto', subsetor_id: 'pri', criado_em: minAtras(2) },
    { status: 'em_atendimento', subsetor_id: 'sup', criado_em: minAtras(9) },
  ]
  const doSetor = calcularTempoReal({ ...base, tickets })
  const suporte = calcularTempoReal({ ...base, tickets, aceitaTicket: (t) => t.subsetor_id === 'sup' })
  const prime = calcularTempoReal({ ...base, tickets, aceitaTicket: (t) => t.subsetor_id === 'pri' })

  assert.equal(suporte.total + prime.total, doSetor.total)
  assert.equal(suporte.naFila + prime.naFila, doSetor.naFila)
  assert.equal(suporte.emAtendimento, 1)
})

test('conta só os atendentes aceitos pelo filtro — base da carga', () => {
  const atendentes = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
  const tickets = [
    { status: 'em_atendimento', criado_em: minAtras(1) },
    { status: 'em_atendimento', criado_em: minAtras(1) },
    { status: 'em_atendimento', criado_em: minAtras(1) },
    { status: 'em_atendimento', criado_em: minAtras(1) },
  ]

  const comDois = calcularTempoReal({ ...base, tickets, atendentes, aceitaAtendente: (a) => a.id !== 'c' })
  assert.equal(comDois.atendentesOnline, 2)
})

test('sem atendente aceito, a contagem é zero​', () => {
  const r = calcularTempoReal({
    ...base,
    tickets: [{ status: 'aberto', criado_em: minAtras(1) }],
    atendentes: [{ id: 'a' }],
    aceitaAtendente: () => false,
  })

  assert.equal(r.atendentesOnline, 0)
})

test('lista vazia devolve tudo zerado, sem NaN', () => {
  const r = calcularTempoReal({ ...base, tickets: [] })
  assert.deepEqual(
    [r.total, r.naFila, r.emAtendimento, r.finalizadosHoje, r.maiorEsperaFilaMs, r.maiorEsperaRespostaMs],
    [0, 0, 0, 0, 0, 0],
  )
})

test('formata como hh:mm:ss, igual ao card que já existia', () => {
  assert.equal(formatarTempoMonitoramento(0), '00:00:00')
  assert.equal(formatarTempoMonitoramento(-5), '00:00:00')
  assert.equal(formatarTempoMonitoramento(Number.NaN), '00:00:00')
  assert.equal(formatarTempoMonitoramento(65_000), '00:01:05')
  assert.equal(formatarTempoMonitoramento(3_661_000), '01:01:01')
  assert.equal(formatarTempoMonitoramento(36 * 3_600_000), '36:00:00')
})
