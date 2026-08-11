import assert from 'node:assert/strict'
import test from 'node:test'
import {
  atendeSubsetor,
  escolherDestino,
  obterExcecaoFilaPrimeParaSuporte,
  ordenarPorEquilibrio,
} from '../lib/distribuicao-fila.ts'

const atendente = (id, recebidosHoje, ticketsAbertos = 0, extra = {}) => ({
  id, recebidosHoje, ticketsAbertos, ...extra,
})

test('quem entra depois recebe até emparelhar com quem começou cedo', () => {
  // Josenildo entrou às 7h e já recebeu 12; Ana acabou de entrar com 0.
  const josenildo = atendente('josenildo', 12)
  const ana = atendente('ana', 0)

  // Ana é escolhida seguidamente até alcançar Josenildo.
  let anaRecebidos = 0
  for (let i = 0; i < 12; i++) {
    const [primeiro] = ordenarPorEquilibrio(
      [josenildo, { ...ana, recebidosHoje: anaRecebidos }],
      10_000,
    )
    assert.equal(primeiro.id, 'ana', `na ${i + 1}ª vez ainda deveria ser Ana`)
    anaRecebidos++
  }

  // Emparelhados: agora o desempate é por quem está há mais tempo sem receber.
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
      atendente('cheio', 1, 10),   // menos recebidos, mas no teto
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

test('só um ticket Prime libera a fila própria do Suporte', () => {
  assert.deepEqual(
    obterExcecaoFilaPrimeParaSuporte('prime', 'prime', 'suporte'),
    ['suporte'],
  )
  assert.deepEqual(
    obterExcecaoFilaPrimeParaSuporte(null, null, 'suporte'),
    [],
  )
})

test('o subsetor do ticket tem precedência: transbordo só quando ninguém do próprio tem vaga', () => {
  const escolha = escolherDestino({
    subsetorDoTicket: 'suporte',
    candidatos: [
      atendente('sup', 40, 3, { subsetorIds: ['suporte'] }),   // muitos recebidos, mas é do subsetor
      atendente('prime', 0, 0, { subsetorIds: ['prime'] }),     // zerado, mas é de outro
    ],
    subsetoresComFila: [],
    maxTicketsAbertos: 10,
  })
  assert.equal(escolha.origem, 'proprio')
  assert.deepEqual(escolha.fila.map((c) => c.id), ['sup'])
})

test('Prime ajuda o Suporte quando o Suporte está sem vaga e a fila Prime está vazia', () => {
  const escolha = escolherDestino({
    subsetorDoTicket: 'suporte',
    candidatos: [
      atendente('sup', 5, 10, { subsetorIds: ['suporte'] }),   // no teto
      atendente('prime', 8, 2, { subsetorIds: ['prime'] }),
    ],
    subsetoresComFila: [],
    maxTicketsAbertos: 10,
  })
  assert.equal(escolha.origem, 'transbordo')
  assert.deepEqual(escolha.fila.map((c) => c.id), ['prime'])
})

test('Prime NÃO é puxado para o Suporte enquanto houver ticket esperando na fila Prime', () => {
  const escolha = escolherDestino({
    subsetorDoTicket: 'suporte',
    candidatos: [
      atendente('sup', 5, 10, { subsetorIds: ['suporte'] }),   // no teto
      atendente('prime', 8, 2, { subsetorIds: ['prime'] }),
    ],
    subsetoresComFila: ['prime'],
    maxTicketsAbertos: 10,
  })
  assert.equal(escolha.origem, 'ninguem')
  assert.deepEqual(escolha.fila, [])
})

test('fila Prime cheia transborda para Suporte quando o Suporte está disponível', () => {
  const escolha = escolherDestino({
    subsetorDoTicket: 'prime',
    candidatos: [
      atendente('prime', 5, 10, { subsetorIds: ['prime'] }),   // no teto
      atendente('sup', 8, 1, { subsetorIds: ['suporte'] }),
    ],
    subsetoresComFila: [],
    maxTicketsAbertos: 10,
  })
  assert.equal(escolha.origem, 'transbordo')
  assert.deepEqual(escolha.fila.map((c) => c.id), ['sup'])
})

test('fila Prime cheia não puxa Suporte que ainda tem fila própria', () => {
  const escolha = escolherDestino({
    subsetorDoTicket: 'prime',
    candidatos: [
      atendente('prime', 5, 10, { subsetorIds: ['prime'] }),
      atendente('sup', 8, 1, { subsetorIds: ['suporte'] }),
    ],
    subsetoresComFila: ['suporte'],
    maxTicketsAbertos: 10,
  })

  assert.equal(escolha.origem, 'ninguem')
  assert.deepEqual(escolha.fila, [])
})

test('Prime pode transbordar para Suporte mesmo com fila própria do Suporte', () => {
  const escolha = escolherDestino({
    subsetorDoTicket: 'prime',
    candidatos: [
      atendente('prime', 5, 10, { subsetorIds: ['prime'] }),
      atendente('sup', 8, 1, { subsetorIds: ['suporte'] }),
    ],
    subsetoresComFila: ['suporte'],
    subsetoresQuePodemReceberMesmoComFila: ['suporte'],
    maxTicketsAbertos: 10,
  })

  assert.equal(escolha.origem, 'transbordo')
  assert.deepEqual(escolha.fila.map((c) => c.id), ['sup'])
})

test('a exceção Prime → Suporte não libera Suporte → Prime com fila Prime', () => {
  const escolha = escolherDestino({
    subsetorDoTicket: 'suporte',
    candidatos: [
      atendente('sup', 5, 10, { subsetorIds: ['suporte'] }),
      atendente('prime', 8, 1, { subsetorIds: ['prime'] }),
    ],
    subsetoresComFila: ['prime'],
    subsetoresQuePodemReceberMesmoComFila: ['suporte'],
    maxTicketsAbertos: 10,
  })

  assert.equal(escolha.origem, 'ninguem')
  assert.deepEqual(escolha.fila, [])
})

test('a exceção do Suporte não ignora fila de outro subsetor do mesmo atendente', () => {
  const escolha = escolherDestino({
    subsetorDoTicket: 'prime',
    candidatos: [
      atendente('prime', 5, 10, { subsetorIds: ['prime'] }),
      atendente('sup-fin', 8, 1, { subsetorIds: ['suporte', 'financeiro'] }),
    ],
    subsetoresComFila: ['suporte', 'financeiro'],
    subsetoresQuePodemReceberMesmoComFila: ['suporte'],
    maxTicketsAbertos: 10,
  })

  assert.equal(escolha.origem, 'ninguem')
  assert.deepEqual(escolha.fila, [])
})

test('no transbordo a equalização continua valendo entre os candidatos', () => {
  const escolha = escolherDestino({
    subsetorDoTicket: 'suporte',
    candidatos: [
      atendente('sup', 1, 10, { subsetorIds: ['suporte'] }),
      atendente('prime-cheio', 2, 4, { subsetorIds: ['prime'] }),
      atendente('prime-vazio', 0, 4, { subsetorIds: ['prime'] }),
    ],
    subsetoresComFila: [],
    maxTicketsAbertos: 10,
  })
  assert.deepEqual(escolha.fila.map((c) => c.id), ['prime-vazio', 'prime-cheio'])
})

test('num lote, o contador precisa subir a cada atribuição — senão tudo vai para o mesmo', () => {
  // Simula o que `redistribuirTicketsPendentes` faz: ordena, atribui ao
  // primeiro, incrementa e reordena para o próximo ticket do MESMO lote.
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

  // Ana empata com Bruno, os dois com Carla, e a partir daí giram por igual.
  assert.deepEqual(escolhidos, ['ana', 'ana', 'bruno', 'ana', 'bruno', 'carla'])
  assert.deepEqual(recebidos, { ana: 3, bruno: 3, carla: 3 })
})

test('sem incrementar o contador, o lote inteiro cairia numa pessoa só', () => {
  // Guarda contra a regressão: se o chamador esquecer de incrementar, a mesma
  // pessoa é escolhida repetidamente. O teste documenta por que o incremento
  // no laço de `redistribuirTicketsPendentes` não é opcional.
  const candidatos = [atendente('ana', 0), atendente('bruno', 1)]
  const escolhidos = Array.from({ length: 3 }, () => ordenarPorEquilibrio(candidatos, 10)[0].id)
  assert.deepEqual(escolhidos, ['ana', 'ana', 'ana'])
})

test('ninguém disponível devolve fila vazia em vez de escolher alguém no teto', () => {
  const escolha = escolherDestino({
    subsetorDoTicket: 'suporte',
    candidatos: [atendente('sup', 1, 10, { subsetorIds: ['suporte'] })],
    subsetoresComFila: [],
    maxTicketsAbertos: 10,
  })
  assert.equal(escolha.origem, 'ninguem')
  assert.equal(escolha.fila.length, 0)
})

// --- Transbordo entre subsetores restrito a Prime e Suporte ---
//
// O transbordo irrestrito engolia o transbordo de SETOR: numa filial, o
// atendente do Financeiro puxava o ticket do Suporte, o ticket nunca envelhecia
// na fila e nunca chegava à Matriz.

const PRIME = 'sub-prime'
const SUPORTE = 'sub-suporte'
const FINANCEIRO = 'sub-financeiro'

test('ticket do Suporte NÃO cai para o Financeiro — segura a fila para transbordar de setor', () => {
  const escolha = escolherDestino({
    subsetorDoTicket: SUPORTE,
    candidatos: [atendente('financeiro', 0, 0, { subsetorIds: [FINANCEIRO] })],
    subsetoresComFila: [SUPORTE],
    subsetoresComTransbordo: [PRIME, SUPORTE],
    maxTicketsAbertos: 5,
  })
  assert.equal(escolha.origem, 'ninguem')
  assert.deepEqual(escolha.fila, [])
})

test('Suporte continua socorrendo Prime dentro do grupo', () => {
  const escolha = escolherDestino({
    subsetorDoTicket: PRIME,
    candidatos: [atendente('suporte', 0, 0, { subsetorIds: [SUPORTE] })],
    subsetoresComFila: [PRIME],
    subsetoresQuePodemReceberMesmoComFila: [SUPORTE],
    subsetoresComTransbordo: [PRIME, SUPORTE],
    maxTicketsAbertos: 5,
  })
  assert.equal(escolha.origem, 'transbordo')
  assert.deepEqual(escolha.fila.map((c) => c.id), ['suporte'])
})

test('atendente que acumula Financeiro e Suporte entra pelo Suporte', () => {
  const escolha = escolherDestino({
    subsetorDoTicket: PRIME,
    candidatos: [atendente('hibrido', 0, 0, { subsetorIds: [FINANCEIRO, SUPORTE] })],
    subsetoresComFila: [PRIME],
    subsetoresComTransbordo: [PRIME, SUPORTE],
    maxTicketsAbertos: 5,
  })
  assert.equal(escolha.origem, 'transbordo')
})

test('ticket de subsetor fora do grupo não transborda para ninguém', () => {
  const escolha = escolherDestino({
    subsetorDoTicket: FINANCEIRO,
    candidatos: [atendente('suporte', 0, 0, { subsetorIds: [SUPORTE] })],
    subsetoresComFila: [FINANCEIRO],
    subsetoresComTransbordo: [PRIME, SUPORTE],
    maxTicketsAbertos: 5,
  })
  assert.equal(escolha.origem, 'ninguem')
})

test('ticket sem subsetor não transborda quando o grupo está definido', () => {
  const escolha = escolherDestino({
    subsetorDoTicket: null,
    candidatos: [atendente('suporte', 0, 0, { subsetorIds: [SUPORTE] })],
    subsetoresComFila: [null],
    subsetoresComTransbordo: [PRIME, SUPORTE],
    maxTicketsAbertos: 5,
  })
  assert.equal(escolha.origem, 'ninguem')
})

test('setor sem Prime nem Suporte fica sem transbordo entre subsetores', () => {
  const escolha = escolherDestino({
    subsetorDoTicket: FINANCEIRO,
    candidatos: [atendente('outro', 0, 0, { subsetorIds: ['sub-comercial'] })],
    subsetoresComFila: [FINANCEIRO],
    subsetoresComTransbordo: [],
    maxTicketsAbertos: 5,
  })
  assert.equal(escolha.origem, 'ninguem')
})

test('sem o grupo definido o transbordo segue irrestrito', () => {
  const escolha = escolherDestino({
    subsetorDoTicket: SUPORTE,
    candidatos: [atendente('financeiro', 0, 0, { subsetorIds: [FINANCEIRO] })],
    subsetoresComFila: [SUPORTE],
    maxTicketsAbertos: 5,
  })
  assert.equal(escolha.origem, 'transbordo')
})

// O atendente do próprio subsetor nunca foi transbordo: a restrição não pode
// alcançá-lo, senão o ticket para de ser atendido por quem é dele.
test('a restrição não afeta o atendente do próprio subsetor', () => {
  const escolha = escolherDestino({
    subsetorDoTicket: FINANCEIRO,
    candidatos: [atendente('financeiro', 0, 0, { subsetorIds: [FINANCEIRO] })],
    subsetoresComFila: [FINANCEIRO],
    subsetoresComTransbordo: [PRIME, SUPORTE],
    maxTicketsAbertos: 5,
  })
  assert.equal(escolha.origem, 'proprio')
  assert.deepEqual(escolha.fila.map((c) => c.id), ['financeiro'])
})
