import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createNexusSessionTicketId,
  createWhatsappInboundMessageId,
  createWhatsappInboundTicketId,
} from '../lib/server/nexus-ticket-id.ts'

const sourceSectorId = 'ca1416cb-2f57-4e0f-9abc-50158d0229ab'
const firstMessageId = '4f6b34a4-a2f6-4d3d-8635-c72e15213c90'

test('creates a stable ticket id for the same Nexus session', () => {
  const first = createNexusSessionTicketId(sourceSectorId, [firstMessageId, crypto.randomUUID()])
  const retry = createNexusSessionTicketId(sourceSectorId, [firstMessageId])

  assert.equal(first, retry)
  assert.match(first, /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
})

test('uses the session boundary and source sector in the ticket id', () => {
  assert.notEqual(
    createNexusSessionTicketId(sourceSectorId, [firstMessageId]),
    createNexusSessionTicketId(crypto.randomUUID(), [firstMessageId]),
  )
  assert.notEqual(
    createNexusSessionTicketId(sourceSectorId, [firstMessageId]),
    createNexusSessionTicketId(sourceSectorId, [crypto.randomUUID()]),
  )
})

test('rejects an empty Nexus session', () => {
  assert.throws(
    () => createNexusSessionTicketId(sourceSectorId, []),
    /ao menos uma mensagem/,
  )
})

test('creates stable and isolated ids for a WhatsApp inbound event', () => {
  const providerMessageId = 'wamid.HBgNNTUxNTk5OTk5OTk5ORUCABIYFjNFQjA'
  const messageId = createWhatsappInboundMessageId(providerMessageId)
  const ticketId = createWhatsappInboundTicketId(providerMessageId)

  assert.equal(messageId, createWhatsappInboundMessageId(providerMessageId))
  assert.equal(ticketId, createWhatsappInboundTicketId(providerMessageId))
  assert.notEqual(messageId, ticketId)
  assert.match(messageId, /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  assert.match(ticketId, /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
})

test('uses the provider event id and rejects an empty idempotency key', () => {
  assert.notEqual(
    createWhatsappInboundMessageId('wamid.first'),
    createWhatsappInboundMessageId('wamid.second'),
  )
  assert.throws(
    () => createWhatsappInboundTicketId('   '),
    /chave idempotente/,
  )
})
