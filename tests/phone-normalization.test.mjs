import assert from 'node:assert/strict'
import test from 'node:test'
import { normalizeBrazilianPhone } from '../lib/phone.ts'

test('adds Brazil code to a landline with DDD', () => {
  assert.equal(normalizeBrazilianPhone('(83) 3234-5678'), '558332345678')
})

test('adds Brazil code to a mobile number with DDD', () => {
  assert.equal(normalizeBrazilianPhone('(83) 99999-5678'), '5583999995678')
})

test('does not duplicate an existing Brazil code', () => {
  assert.equal(normalizeBrazilianPhone('55 83 3234-5678'), '558332345678')
  assert.equal(normalizeBrazilianPhone('55 83 99999-5678'), '5583999995678')
})
