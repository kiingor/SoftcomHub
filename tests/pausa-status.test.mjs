import assert from 'node:assert/strict'
import test from 'node:test'
import { computePausaElapsedMs, isPausaEstourada, formatPausaElapsedLabel, formatPausaLabel } from '../lib/pausa-status.ts'

const NOW = new Date('2026-07-23T12:30:00.000Z').getTime()

test('computes elapsed time in ms since the pausa started', () => {
  const pausaInfo = { nome: 'Almoço', inicio: '2026-07-23T12:00:00.000Z', tempoMaximoMinutos: 60 }
  assert.equal(computePausaElapsedMs(pausaInfo, NOW), 30 * 60 * 1000)
})

test('elapsed time is 0 when pausa info has no inicio (not loaded yet)', () => {
  assert.equal(computePausaElapsedMs(null, NOW), 0)
  assert.equal(computePausaElapsedMs(undefined, NOW), 0)
})

test('alert flips exactly at the configured limit, not up to a minute late', () => {
  const pausaInfo = { nome: 'Almoço', inicio: '2026-07-23T12:00:00.000Z', tempoMaximoMinutos: 30 }
  // 29min59s — still within the limit
  assert.equal(isPausaEstourada(pausaInfo, 29 * 60 * 1000 + 59_000), false)
  // exactly at 30min — not yet over (strictly greater than)
  assert.equal(isPausaEstourada(pausaInfo, 30 * 60 * 1000), false)
  // 30min01s — now it is over
  assert.equal(isPausaEstourada(pausaInfo, 30 * 60 * 1000 + 1_000), true)
})

test('a pausa without a configured limit never shows as estourada', () => {
  const pausaInfo = { nome: 'Banheiro', inicio: '2026-07-23T00:00:00.000Z', tempoMaximoMinutos: null }
  assert.equal(isPausaEstourada(pausaInfo, 999_999_999), false)
})

test('formats elapsed time as HH:MM', () => {
  const pausaInfo = { nome: 'Almoço', inicio: '2026-07-23T12:00:00.000Z', tempoMaximoMinutos: 60 }
  assert.equal(formatPausaElapsedLabel(pausaInfo, 90 * 60 * 1000), '01:30')
})

test('never renders "Pausa · null" — falls back to just the pausa name when data is missing', () => {
  assert.equal(formatPausaLabel(null, 0), 'Pausa')
  assert.equal(formatPausaLabel({ nome: 'Almoço', inicio: '', tempoMaximoMinutos: null }, 0), 'Almoço')
})

test('combines name and elapsed time when both are available', () => {
  const pausaInfo = { nome: 'Almoço', inicio: '2026-07-23T12:00:00.000Z', tempoMaximoMinutos: 60 }
  assert.equal(formatPausaLabel(pausaInfo, 30 * 60 * 1000), 'Almoço · 00:30')
})
