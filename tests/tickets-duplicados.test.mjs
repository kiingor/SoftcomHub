import assert from 'node:assert/strict'
import test from 'node:test'
import {
  idsComDuplicidade,
  isTicketAberto,
  rotuloDuplicidade,
  ticketsAbertos,
} from '../lib/tickets-duplicados.ts'

test('só aberto e em_atendimento contam como atendimento aberto', () => {
  assert.equal(isTicketAberto('aberto'), true)
  assert.equal(isTicketAberto('em_atendimento'), true)
  assert.equal(isTicketAberto('encerrado'), false)
  assert.equal(isTicketAberto('avaliar'), false)
  assert.equal(isTicketAberto(null), false)
  assert.equal(isTicketAberto(undefined), false)
})

test('marca os dois tickets do par duplicado — é o caso real de produção', () => {
  // Padrão observado em 24/07: mesmo cliente, dois tickets criados com segundos
  // de diferença e atribuídos a atendentes diferentes.
  const tickets = [
    { id: 'a', cliente_id: 'c1', status: 'em_atendimento' },
    { id: 'b', cliente_id: 'c1', status: 'em_atendimento' },
    { id: 'c', cliente_id: 'c2', status: 'em_atendimento' },
  ]
  const dup = idsComDuplicidade(tickets)
  assert.deepEqual([...dup].sort(), ['a', 'b'])
  assert.equal(dup.has('c'), false)
})

test('atendimento encerrado não conflita com um em andamento', () => {
  const tickets = [
    { id: 'antigo', cliente_id: 'c1', status: 'encerrado' },
    { id: 'atual', cliente_id: 'c1', status: 'em_atendimento' },
  ]
  assert.equal(idsComDuplicidade(tickets).size, 0)
})

test('três tickets abertos do mesmo cliente marcam todos os três', () => {
  const tickets = [
    { id: 'a', cliente_id: 'c1', status: 'aberto' },
    { id: 'b', cliente_id: 'c1', status: 'em_atendimento' },
    { id: 'c', cliente_id: 'c1', status: 'aberto' },
  ]
  assert.equal(idsComDuplicidade(tickets).size, 3)
})

test('ticket sem cliente_id nunca é marcado — não dá para afirmar duplicidade', () => {
  const tickets = [
    { id: 'a', cliente_id: null, status: 'em_atendimento' },
    { id: 'b', cliente_id: null, status: 'em_atendimento' },
    { id: 'c', cliente_id: undefined, status: 'aberto' },
  ]
  assert.equal(idsComDuplicidade(tickets).size, 0)
})

test('lista vazia ou sem duplicidade não marca nada', () => {
  assert.equal(idsComDuplicidade([]).size, 0)
  assert.equal(idsComDuplicidade([{ id: 'a', cliente_id: 'c1', status: 'aberto' }]).size, 0)
})

test('ticketsAbertos filtra o histórico do cliente pelos que seguem abertos', () => {
  const historico = [
    { id: 'a', status: 'encerrado' },
    { id: 'b', status: 'em_atendimento' },
    { id: 'c', status: 'aberto' },
    { id: 'd', status: null },
  ]
  assert.deepEqual(ticketsAbertos(historico).map((t) => t.id), ['b', 'c'])
})

test('o aviso concorda em número com a quantidade', () => {
  assert.equal(rotuloDuplicidade(1), 'Este cliente tem outro atendimento aberto')
  assert.equal(rotuloDuplicidade(2), 'Este cliente tem outros 2 atendimentos abertos')
})
