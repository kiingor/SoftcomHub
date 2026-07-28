import assert from 'node:assert/strict'
import test from 'node:test'
import {
  formatTicketStatus,
  formatTicketStatusCurto,
  ticketStatusBadgeClass,
} from '../lib/ticket-status.ts'

test('ticket em avaliação NÃO é reportado como aberto', () => {
  // O bug: o relatório usava um ternário que caía em 'Aberto' para qualquer
  // status fora de encerrado/em_atendimento.
  assert.equal(formatTicketStatus('avaliar'), 'Em avaliação')
  assert.equal(formatTicketStatusCurto('avaliar'), 'Avaliação')
  assert.notEqual(formatTicketStatus('avaliar'), 'Aberto')
})

test('os quatro status reais da base têm rótulo próprio', () => {
  assert.equal(formatTicketStatus('aberto'), 'Aberto')
  assert.equal(formatTicketStatus('em_atendimento'), 'Em atendimento')
  assert.equal(formatTicketStatus('avaliar'), 'Em avaliação')
  assert.equal(formatTicketStatus('encerrado'), 'Finalizado')
})

test('status desconhecido volta cru, nunca vira outro status', () => {
  assert.equal(formatTicketStatus('status_novo'), 'status_novo')
  assert.equal(formatTicketStatusCurto('status_novo'), 'status_novo')
})

test('ausência de status vira string vazia, não um rótulo inventado', () => {
  assert.equal(formatTicketStatus(null), '')
  assert.equal(formatTicketStatus(undefined), '')
  assert.equal(formatTicketStatus(''), '')
})

test('cada status conhecido tem cor própria e desconhecido não tem', () => {
  const cores = ['aberto', 'em_atendimento', 'avaliar', 'encerrado'].map(ticketStatusBadgeClass)
  assert.equal(new Set(cores).size, 4, 'cores devem ser distintas entre si')
  cores.forEach((c) => assert.notEqual(c, ''))
  assert.equal(ticketStatusBadgeClass('status_novo'), '')
  assert.equal(ticketStatusBadgeClass(null), '')
})
