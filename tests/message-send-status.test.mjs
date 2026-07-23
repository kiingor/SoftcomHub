import assert from 'node:assert/strict'
import test from 'node:test'
import { computeSendOutcome } from '../lib/message-send-status.ts'

test('a brand new message is pending, never shows as sent by default', () => {
  assert.equal(computeSendOutcome(undefined, 'pendente'), 'pending')
})

test('ephemeral "sending" takes priority over any persisted state', () => {
  assert.equal(computeSendOutcome('sending', 'falhou'), 'sending')
  assert.equal(computeSendOutcome('sending', null), 'sending')
})

test('a confirmed HTTP success reflects as sent once ephemeral state clears', () => {
  assert.equal(computeSendOutcome(undefined, 'enviado'), 'normal')
})

test('a confirmed HTTP failure reflects as failed even after ephemeral state clears (reload)', () => {
  assert.equal(computeSendOutcome(undefined, 'falhou'), 'failed')
  assert.equal(computeSendOutcome('error', 'falhou'), 'failed')
})

test('a lost response (connection dropped) is indeterminate, not a confirmed failure', () => {
  assert.equal(computeSendOutcome(undefined, 'indeterminado'), 'indeterminate')
})

test('legacy rows with null status_envio are treated as normal (not scary)', () => {
  assert.equal(computeSendOutcome(undefined, null), 'normal')
  assert.equal(computeSendOutcome(undefined, undefined), 'normal')
})

test('ephemeral "sent" (few seconds after a successful send) shows the transient check', () => {
  assert.equal(computeSendOutcome('sent', 'enviado'), 'sent')
})
