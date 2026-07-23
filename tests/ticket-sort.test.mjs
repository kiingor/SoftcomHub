import assert from 'node:assert/strict'
import test from 'node:test'
import {
  areSetorSortConfigsEqual,
  sortTicketsBySetorConfig,
  ticketSortKey,
} from '../lib/ticket-sort.ts'

test('a locked setor sorts by creation time, ignoring new messages', () => {
  const travarPorSetor = new Map([['setor-a', true]])
  const ticket = { setor_id: 'setor-a', criado_em: '2026-07-23T10:00:00.000Z', ultima_mensagem_em: '2026-07-23T12:00:00.000Z' }
  assert.equal(ticketSortKey(ticket, travarPorSetor), '2026-07-23T10:00:00.000Z')
})

test('an unlocked setor sorts by last message, falling back to creation time', () => {
  const travarPorSetor = new Map([['setor-a', false]])
  const withMessage = { setor_id: 'setor-a', criado_em: '2026-07-23T10:00:00.000Z', ultima_mensagem_em: '2026-07-23T12:00:00.000Z' }
  assert.equal(ticketSortKey(withMessage, travarPorSetor), '2026-07-23T12:00:00.000Z')

  const withoutMessage = { setor_id: 'setor-a', criado_em: '2026-07-23T10:00:00.000Z', ultima_mensagem_em: null }
  assert.equal(ticketSortKey(withoutMessage, travarPorSetor), '2026-07-23T10:00:00.000Z')
})

test('each ticket uses its OWN setor config — a multi-sector attendant is not affected globally', () => {
  const travarPorSetor = new Map([
    ['setor-locked', true],
    ['setor-free', false],
  ])
  const lockedTicket = { setor_id: 'setor-locked', criado_em: '2026-07-23T09:00:00.000Z', ultima_mensagem_em: '2026-07-23T13:00:00.000Z' }
  const freeTicket = { setor_id: 'setor-free', criado_em: '2026-07-23T09:00:00.000Z', ultima_mensagem_em: '2026-07-23T13:00:00.000Z' }

  // Same raw data, different setor config — locked ignores the new message, free doesn't.
  assert.equal(ticketSortKey(lockedTicket, travarPorSetor), '2026-07-23T09:00:00.000Z')
  assert.equal(ticketSortKey(freeTicket, travarPorSetor), '2026-07-23T13:00:00.000Z')
})

test('a setor whose lock config has not loaded yet defaults to unlocked (never breaks sorting)', () => {
  const travarPorSetor = new Map()
  const ticket = { setor_id: 'setor-unknown', criado_em: '2026-07-23T10:00:00.000Z', ultima_mensagem_em: '2026-07-23T12:00:00.000Z' }
  assert.equal(ticketSortKey(ticket, travarPorSetor), '2026-07-23T12:00:00.000Z')
})

test('a ticket without a setor_id defaults to unlocked', () => {
  const travarPorSetor = new Map([['setor-a', true]])
  const ticket = { setor_id: null, criado_em: '2026-07-23T10:00:00.000Z', ultima_mensagem_em: '2026-07-23T12:00:00.000Z' }
  assert.equal(ticketSortKey(ticket, travarPorSetor), '2026-07-23T12:00:00.000Z')
})

test('sorting uses the freshly loaded per-sector map without mutating the source list', () => {
  const oldest = { id: 'oldest', setor_id: 'setor-a', criado_em: '2026-07-23T09:00:00.000Z', ultima_mensagem_em: '2026-07-23T13:00:00.000Z' }
  const newest = { id: 'newest', setor_id: 'setor-a', criado_em: '2026-07-23T10:00:00.000Z', ultima_mensagem_em: '2026-07-23T11:00:00.000Z' }
  const source = [oldest, newest]

  assert.deepEqual(
    sortTicketsBySetorConfig(source, new Map([['setor-a', true]])).map((ticket) => ticket.id),
    ['newest', 'oldest'],
  )
  assert.deepEqual(source.map((ticket) => ticket.id), ['oldest', 'newest'])
})

test('config comparison detects an actual sector setting change', () => {
  assert.equal(
    areSetorSortConfigsEqual(
      new Map([['setor-a', false]]),
      new Map([['setor-a', false]]),
    ),
    true,
  )
  assert.equal(
    areSetorSortConfigsEqual(
      new Map([['setor-a', false]]),
      new Map([['setor-a', true]]),
    ),
    false,
  )
})
