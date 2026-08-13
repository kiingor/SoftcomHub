import assert from 'node:assert/strict'
import test from 'node:test'
import {
  atendeSubsetor,
  escolherDestino,
  ordenarPorEquilibrio,
} from '../lib/distribuicao-fila.ts'

const atendente = (id, recebidosHoje, ticketsAbertos = 0, extra = {}) => ({
  id, recebidosHoje, ticketsAbertos, ...extra,
})

const PRIME = 'sub-prime'
const SUPORTE = 'sub-suporte'
const FINANCEIRO = 'sub-financeiro'
const PARES = [
  { de: SUPORTE, para: PRIME },
  {
    de: PRIME,
    para: SUPORTE,
    somenteSemAtendentePresente: true,
    ignoraFilaDoSocorrista: true,
  },
]

test('quem entra depois recebe até emparelhar com quem começou cedo', () => {
  const josenildo = atendente('josenildo', 12)
  const ana = atendente('ana', 0)
  let anaRecebidos = 0

  for (let i = 0; i < 12; i++) {
    const [primeiro] = ordenarPorEquilibrio(
      [josenildo, { ...ana, recebidosHoje: anaRecebidos }],
      10_000,
    )
    assert.equal(primeiro.id, 'ana', `na ${i + 1}ª vez ainda deveria ser Ana`)
    anaRecebidos++
  }

  const empate = ordenarPorEquilibrio(
    [
      { ...josenildo, ultimaAtribuicaoEm: '2026-07-27T09:00:00Z' },
      { ...ana, recebidosHoje: 12, ultimaAtribuicaoEm: '2026-07-27T11:00:00Z' },
    ],
    10_000,
  )
  assert.equal(empate[0].id, 'josenildo')
})

test('o teto de tickets abertos exclui o atendente, mas não muda a ordem dos demais', () => {
  const fila = ordenarPorEquilibrio(
    [
      atendente('cheio', 1, 10),
      atendente('livre', 5, 2),
      atendente('meio', 3, 9),
    ],
    10,
  )
  assert.deepEqual(fila.map((c) => c.id), ['meio', 'livre'])
})

test('teto zero ou negativo desliga o limite', () => {
  const fila = ordenarPorEquilibrio([atendente('a', 1, 999)], 0)
  assert.equal(fila.length, 1)
})

test('empate total é resolvido de forma determinística', () => {
  const um = ordenarPorEquilibrio([atendente('b', 0), atendente('a', 0)], 10)
  const dois = ordenarPorEquilibrio([atendente('a', 0), atendente('b', 0)], 10)
  assert.deepEqual(um.map((c) => c.id), dois.map((c) => c.id))
})

test('atendente sem subsetor atende ticket sem subsetor, e não o contrário', () => {
  assert.equal(atendeSubsetor(null, []), true)
  assert.equal(atendeSubsetor(null, ['prime']), false)
  assert.equal(atendeSubsetor('prime', ['prime']), true)
  assert.equal(atendeSubsetor('prime', ['suporte']), false)
  assert.equal(atendeSubsetor('prime', undefined), false)
})

test('o subsetor do ticket tem precedência: transbordo só quando ninguém do próprio tem vaga', () => {
  const escolha = escolherDestino({
    subsetorDoTicket: 'suporte',
    candidatos: [
      atendente('sup', 40, 3, { subsetorIds: ['suporte'] }),
      atendente('prime', 0, 0, { subsetorIds: ['prime'] }),
    ],
    subsetoresComFila: [],
    maxTicketsAbertos: 10,
  })
  assert.equal(escolha.origem, 'proprio')
  assert.deepEqual(escolha.fila.map((c) => c.id), ['sup'])
})

test('Prime ajuda o Suporte quando o Suporte está sem vaga e a fila Prime está vazia', () => {
  const escolha = escolherDestino({
    subsetorDoTicket: SUPORTE,
    candidatos: [
      atendente('sup', 5, 10, { subsetorIds: [SUPORTE] }),
      atendente('prime', 8, 2, { subsetorIds: [PRIME] }),
    ],
    subsetoresComFila: [],
    paresDeTransbordo: PARES,
    maxTicketsAbertos: 10,
  })
  assert.equal(escolha.origem, 'transbordo')
  assert.deepEqual(escolha.fila.map((c) => c.id), ['prime'])
})

test('Prime não é puxado para o Suporte enquanto houver ticket esperando na fila Prime', () => {
  const escolha = escolherDestino({
    subsetorDoTicket: SUPORTE,
    candidatos: [
      atendente('sup', 5, 10, { subsetorIds: [SUPORTE] }),
      atendente('prime', 8, 2, { subsetorIds: [PRIME] }),
    ],
    subsetoresComFila: [PRIME],
    paresDeTransbordo: PARES,
    maxTicketsAbertos: 10,
  })
  assert.equal(escolha.origem, 'ninguem')
  assert.deepEqual(escolha.fila, [])
})

test('ticket Prime fica na fila quando há atendente Prime presente no teto', () => {
  const escolha = escolherDestino({
    subsetorDoTicket: PRIME,
    candidatos: [
      atendente('prime', 5, 10, { subsetorIds: [PRIME] }),
      atendente('sup', 8, 1, { subsetorIds: [SUPORTE] }),
    ],
    subsetoresComFila: [],
    paresDeTransbordo: PARES,
    subsetorDoTicketTemAtendentePresente: true,
    maxTicketsAbertos: 10,
  })
  assert.deepEqual(escolha, { fila: [], origem: 'ninguem' })
})

test('fila Prime cheia não puxa Suporte que ainda tem fila própria', () => {
  const escolha = escolherDestino({
    subsetorDoTicket: PRIME,
    candidatos: [
      atendente('prime', 5, 10, { subsetorIds: [PRIME] }),
      atendente('sup', 8, 1, { subsetorIds: [SUPORTE] }),
    ],
    subsetoresComFila: [SUPORTE],
    paresDeTransbordo: PARES,
    subsetorDoTicketTemAtendentePresente: true,
    maxTicketsAbertos: 10,
  })
  assert.deepEqual(escolha, { fila: [], origem: 'ninguem' })
})

test('ticket Prime fica na fila quando o atendente Prime presente está em pausa', () => {
  const escolha = escolherDestino({
    subsetorDoTicket: PRIME,
    candidatos: [atendente('sup', 8, 1, { subsetorIds: [SUPORTE] })],
    subsetoresComFila: [],
    paresDeTransbordo: PARES,
    subsetorDoTicketTemAtendentePresente: true,
    maxTicketsAbertos: 10,
  })
  assert.deepEqual(escolha, { fila: [], origem: 'ninguem' })
})

test('o par Suporte → Prime não abre transbordo no sentido Prime → Suporte', () => {
  const escolha = escolherDestino({
    subsetorDoTicket: PRIME,
    candidatos: [atendente('sup', 8, 1, { subsetorIds: [SUPORTE] })],
    subsetoresComFila: [],
    paresDeTransbordo: [{ de: SUPORTE, para: PRIME }],
    subsetorDoTicketTemAtendentePresente: true,
    maxTicketsAbertos: 10,
  })
  assert.deepEqual(escolha, { fila: [], origem: 'ninguem' })
})

test('ignorar a fila do Suporte não ignora fila de outro subsetor do mesmo atendente', () => {
  const escolha = escolherDestino({
    subsetorDoTicket: PRIME,
    candidatos: [
      atendente('sup-fin', 8, 1, { subsetorIds: [SUPORTE, FINANCEIRO] }),
    ],
    subsetoresComFila: [SUPORTE, FINANCEIRO],
    paresDeTransbordo: PARES,
    subsetorDoTicketTemAtendentePresente: false,
    maxTicketsAbertos: 10,
  })
  assert.deepEqual(escolha, { fila: [], origem: 'ninguem' })
})

test('no transbordo a equalização continua valendo entre os candidatos', () => {
  const escolha = escolherDestino({
    subsetorDoTicket: SUPORTE,
    candidatos: [
      atendente('sup', 1, 10, { subsetorIds: [SUPORTE] }),
      atendente('prime-cheio', 2, 4, { subsetorIds: [PRIME] }),
      atendente('prime-vazio', 0, 4, { subsetorIds: [PRIME] }),
    ],
    subsetoresComFila: [],
    paresDeTransbordo: PARES,
    maxTicketsAbertos: 10,
  })
  assert.deepEqual(escolha.fila.map((c) => c.id), ['prime-vazio', 'prime-cheio'])
})

test('num lote, o contador precisa subir a cada atribuição — senão tudo vai para o mesmo', () => {
  const recebidos = { ana: 0, bruno: 1, carla: 2 }
  const escolhidos = []

  for (let i = 0; i < 6; i++) {
    const [primeiro] = ordenarPorEquilibrio(
      Object.entries(recebidos).map(([id, n]) => atendente(id, n)),
      10,
    )
    escolhidos.push(primeiro.id)
    recebidos[primeiro.id]++
  }

  assert.deepEqual(escolhidos, ['ana', 'ana', 'bruno', 'ana', 'bruno', 'carla'])
  assert.deepEqual(recebidos, { ana: 3, bruno: 3, carla: 3 })
})

test('sem incrementar o contador, o lote inteiro cairia numa pessoa só', () => {
  const candidatos = [atendente('ana', 0), atendente('bruno', 1)]
  const escolhidos = Array.from(
    { length: 3 },
    () => ordenarPorEquilibrio(candidatos, 10)[0].id,
  )
  assert.deepEqual(escolhidos, ['ana', 'ana', 'ana'])
})

test('ninguém disponível devolve fila vazia em vez de escolher alguém no teto', () => {
  const escolha = escolherDestino({
    subsetorDoTicket: SUPORTE,
    candidatos: [atendente('sup', 1, 10, { subsetorIds: [SUPORTE] })],
    subsetoresComFila: [],
    maxTicketsAbertos: 10,
  })
  assert.equal(escolha.origem, 'ninguem')
  assert.equal(escolha.fila.length, 0)
})

test('ticket Prime transborda para Suporte quando não há atendente Prime presente', () => {
  const escolha = escolherDestino({
    subsetorDoTicket: PRIME,
    candidatos: [atendente('suporte', 0, 0, { subsetorIds: [SUPORTE] })],
    subsetoresComFila: [],
    paresDeTransbordo: PARES,
    subsetorDoTicketTemAtendentePresente: false,
    maxTicketsAbertos: 5,
  })
  assert.equal(escolha.origem, 'transbordo')
  assert.deepEqual(escolha.fila.map((c) => c.id), ['suporte'])
})

test('ticket Prime sem atendente presente transborda mesmo com fila no Suporte', () => {
  const escolha = escolherDestino({
    subsetorDoTicket: PRIME,
    candidatos: [atendente('suporte', 0, 0, { subsetorIds: [SUPORTE] })],
    subsetoresComFila: [SUPORTE],
    paresDeTransbordo: PARES,
    subsetorDoTicketTemAtendentePresente: false,
    maxTicketsAbertos: 5,
  })
  assert.equal(escolha.origem, 'transbordo')
  assert.deepEqual(escolha.fila.map((c) => c.id), ['suporte'])
})

test('presença omitida é tratada como verdadeira e segura o ticket Prime', () => {
  const escolha = escolherDestino({
    subsetorDoTicket: PRIME,
    candidatos: [atendente('suporte', 0, 0, { subsetorIds: [SUPORTE] })],
    subsetoresComFila: [],
    paresDeTransbordo: PARES,
    maxTicketsAbertos: 5,
  })
  assert.deepEqual(escolha, { fila: [], origem: 'ninguem' })
})

test('subsetor fora dos pares não socorre ticket de subsetor participante', () => {
  const escolha = escolherDestino({
    subsetorDoTicket: SUPORTE,
    candidatos: [atendente('financeiro', 0, 0, { subsetorIds: [FINANCEIRO] })],
    subsetoresComFila: [],
    paresDeTransbordo: PARES,
    maxTicketsAbertos: 5,
  })
  assert.deepEqual(escolha, { fila: [], origem: 'ninguem' })
})

test('ticket de subsetor fora dos pares não é socorrido', () => {
  const escolha = escolherDestino({
    subsetorDoTicket: FINANCEIRO,
    candidatos: [atendente('suporte', 0, 0, { subsetorIds: [SUPORTE] })],
    subsetoresComFila: [],
    paresDeTransbordo: PARES,
    maxTicketsAbertos: 5,
  })
  assert.deepEqual(escolha, { fila: [], origem: 'ninguem' })
})

test('pares de transbordo indefinidos preservam o comportamento irrestrito legado', () => {
  const escolha = escolherDestino({
    subsetorDoTicket: SUPORTE,
    candidatos: [atendente('financeiro', 0, 0, { subsetorIds: [FINANCEIRO] })],
    subsetoresComFila: [],
    paresDeTransbordo: undefined,
    maxTicketsAbertos: 5,
  })
  assert.equal(escolha.origem, 'transbordo')
  assert.deepEqual(escolha.fila.map((c) => c.id), ['financeiro'])
})

test('a restrição não afeta o atendente do próprio subsetor', () => {
  const escolha = escolherDestino({
    subsetorDoTicket: FINANCEIRO,
    candidatos: [atendente('financeiro', 0, 0, { subsetorIds: [FINANCEIRO] })],
    subsetoresComFila: [FINANCEIRO],
    paresDeTransbordo: PARES,
    maxTicketsAbertos: 5,
  })
  assert.equal(escolha.origem, 'proprio')
  assert.deepEqual(escolha.fila.map((c) => c.id), ['financeiro'])
})
