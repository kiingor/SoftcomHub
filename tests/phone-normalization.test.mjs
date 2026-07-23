import assert from 'node:assert/strict'
import test from 'node:test'
import { normalizeBrazilianPhone, stripBrazilCountryCode } from '../lib/phone.ts'

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

test('strips the Brazil country code from a mobile number', () => {
  assert.equal(stripBrazilCountryCode('5511999999999'), '11999999999')
})

test('strips the Brazil country code from a landline number', () => {
  assert.equal(stripBrazilCountryCode('551133334444'), '1133334444')
})

test('does not strip a number that is already without country code', () => {
  assert.equal(stripBrazilCountryCode('11999999999'), '11999999999')
})

test('does not mistake DDD 55 (Rio Grande do Sul) for a country code', () => {
  // DDD 55 + 9 digit mobile = 11 digits total — must NOT be treated as "55 + DDD"
  assert.equal(stripBrazilCountryCode('55999998888'), '55999998888')
})

test('handles empty/null input', () => {
  assert.equal(stripBrazilCountryCode(''), '')
  assert.equal(stripBrazilCountryCode(null), '')
  assert.equal(stripBrazilCountryCode(undefined), '')
})
