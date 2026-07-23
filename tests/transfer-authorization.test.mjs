import assert from 'node:assert/strict'
import test from 'node:test'
import { canTransferTicket } from '../lib/transfer-authorization.ts'

test('the ticket owner can always transfer their own ticket', () => {
  const actor = { id: 'colab-1', isMaster: false, canSeeAllTickets: false, linkedSetorIds: [] }
  const ticket = { colaboradorId: 'colab-1', setorId: 'setor-a' }
  assert.deepEqual(canTransferTicket(actor, ticket), { allowed: true })
})

test('master transfers a ticket from any setor, even without being the owner', () => {
  const actor = { id: 'master-1', isMaster: true, canSeeAllTickets: false, linkedSetorIds: [] }
  const ticket = { colaboradorId: 'someone-else', setorId: 'setor-b' }
  assert.deepEqual(canTransferTicket(actor, ticket), { allowed: true })
})

test('supervisor (can_see_all_tickets) transfers a ticket from a setor they are linked to', () => {
  const actor = { id: 'supervisor-1', isMaster: false, canSeeAllTickets: true, linkedSetorIds: ['setor-a'] }
  const ticket = { colaboradorId: 'someone-else', setorId: 'setor-a' }
  assert.deepEqual(canTransferTicket(actor, ticket), { allowed: true })
})

test('supervisor is rejected for a ticket from a setor they are NOT linked to', () => {
  const actor = { id: 'supervisor-1', isMaster: false, canSeeAllTickets: true, linkedSetorIds: ['setor-a'] }
  const ticket = { colaboradorId: 'someone-else', setorId: 'setor-b' }
  assert.deepEqual(canTransferTicket(actor, ticket), { allowed: false, reason: 'SUPERVISOR_OUT_OF_SCOPE' })
})

test('a regular attendant (no can_see_all_tickets) cannot transfer someone else\'s ticket', () => {
  const actor = { id: 'colab-2', isMaster: false, canSeeAllTickets: false, linkedSetorIds: ['setor-a'] }
  const ticket = { colaboradorId: 'someone-else', setorId: 'setor-a' }
  assert.deepEqual(canTransferTicket(actor, ticket), { allowed: false, reason: 'NOT_OWNER' })
})
