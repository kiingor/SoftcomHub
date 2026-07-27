import assert from 'node:assert/strict'
import test from 'node:test'
import {
  computePausaElapsedMs,
  isPausaEstourada,
  formatPausaElapsedLabel,
  formatPausaLabel,
  formatPausaStatusLabel,
} from '../lib/pausa-status.ts'

const NOW = new Date('2026-07-23T12:30:00.000Z').getTime()

test('computes elapsed time in ms since the pausa started', () => {
  const pausaInfo = { nome: 'Almoço', inicio: '2026-07-23T12:00:00.000Z', tempoMaximoMinutos: 60 }
  assert.equal(computePausaElapsedMs(pausaInfo, NOW), 30 * 60 * 1000)
})

test('elapsed time is 0 when pausa info has no inicio (not loaded yet)', () => {
  assert.equal(computePausaElapsedMs(null, NOW), 0)
  assert.equal(computePausaElapsedMs(undefined, NOW), 0)
})

test('invalid or future dates never produce negative or NaN elapsed time', () => {
  const invalid = { nome: 'Pausa', inicio: 'invalid-date', tempoMaximoMinutos: 30 }
  const future = { nome: 'Pausa', inicio: '2026-07-23T13:00:00.000Z', tempoMaximoMinutos: 30 }

  assert.equal(computePausaElapsedMs(invalid, NOW), 0)
  assert.equal(computePausaElapsedMs(future, NOW), 0)
  assert.equal(computePausaElapsedMs(future, Number.NaN), 0)
  assert.equal(formatPausaElapsedLabel(invalid, 0), null)
  assert.equal(formatPausaElapsedLabel(future, -1), null)
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

test('invalid persisted limits and elapsed values never show as exceeded', () => {
  const negativeLimit = { nome: 'Pausa', inicio: '2026-07-23T12:00:00.000Z', tempoMaximoMinutos: -1 }
  assert.equal(isPausaEstourada(negativeLimit, 60_000), false)
  assert.equal(isPausaEstourada({ ...negativeLimit, tempoMaximoMinutos: 30 }, Number.NaN), false)
})

test('formats elapsed time as HH:MM:SS', () => {
  const pausaInfo = { nome: 'Almoço', inicio: '2026-07-23T12:00:00.000Z', tempoMaximoMinutos: 60 }
  assert.equal(formatPausaElapsedLabel(pausaInfo, 0), '00:00:00')
  assert.equal(formatPausaElapsedLabel(pausaInfo, 1_000), '00:00:01')
  // seconds -> minutes boundary
  assert.equal(formatPausaElapsedLabel(pausaInfo, 59_000), '00:00:59')
  assert.equal(formatPausaElapsedLabel(pausaInfo, 60_000), '00:01:00')
  // minutes -> hours boundary
  assert.equal(formatPausaElapsedLabel(pausaInfo, 59 * 60 * 1000 + 59_000), '00:59:59')
  assert.equal(formatPausaElapsedLabel(pausaInfo, 60 * 60 * 1000), '01:00:00')
  assert.equal(formatPausaElapsedLabel(pausaInfo, 90 * 60 * 1000), '01:30:00')
})

test('hours keep accumulating past 24 instead of wrapping like a clock', () => {
  const pausaInfo = { nome: 'Almoço', inicio: '2026-07-23T12:00:00.000Z', tempoMaximoMinutos: 60 }
  // 25h 00min 05s
  assert.equal(formatPausaElapsedLabel(pausaInfo, 25 * 3_600_000 + 5_000), '25:00:05')
})

test('never renders "Pausa · null" — falls back to just the pausa name when data is missing', () => {
  assert.equal(formatPausaLabel(null, 0), 'Pausa')
  assert.equal(formatPausaLabel({ nome: 'Almoço', inicio: '', tempoMaximoMinutos: null }, 0), 'Almoço')
})

test('combines name and elapsed time when both are available', () => {
  const pausaInfo = { nome: 'Almoço', inicio: '2026-07-23T12:00:00.000Z', tempoMaximoMinutos: 60 }
  assert.equal(formatPausaLabel(pausaInfo, 30 * 60 * 1000 + 1_000), 'Almoço · 00:30:01')
})

test('announces an exceeded pause limit in text, not only by color', () => {
  const pausaInfo = { nome: 'Almoço', inicio: '2026-07-23T12:00:00.000Z', tempoMaximoMinutos: 30 }
  // Segundos passaram a fazer parte do rótulo (HH:MM:SS) — o supervisor precisa
  // ver o cronômetro andar, não só o minuto virar.
  assert.equal(formatPausaStatusLabel(pausaInfo, 30 * 60 * 1000), 'Almoço · 00:30:00')
  assert.equal(formatPausaStatusLabel(pausaInfo, 31 * 60 * 1000), 'Almoço · 00:31:00 · limite excedido')
})
