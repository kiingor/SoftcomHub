import assert from 'node:assert/strict'
import test from 'node:test'
import {
  computeAtendimentoStatus,
  formatAtendimentoStatusLabel,
  atendimentoStatusBadgeClass,
  isValidAtendimentoStatusThresholds,
} from '../lib/atendimento-status.ts'

test('under 30min is normal', () => {
  assert.equal(computeAtendimentoStatus(0), 'normal')
  assert.equal(computeAtendimentoStatus(29 * 60 * 1000 + 59_000), 'normal')
})

test('flips to atencao exactly at 30min', () => {
  assert.equal(computeAtendimentoStatus(30 * 60 * 1000), 'atencao')
  assert.equal(computeAtendimentoStatus(30 * 60 * 1000 + 1), 'atencao')
})

test('flips to critico exactly at 40min', () => {
  assert.equal(computeAtendimentoStatus(39 * 60 * 1000 + 59_999), 'atencao')
  assert.equal(computeAtendimentoStatus(40 * 60 * 1000), 'critico')
  assert.equal(computeAtendimentoStatus(60 * 60 * 1000), 'critico')
})

test('uses the thresholds configured for the sector', () => {
  const thresholds = { atencaoMinutos: 2, criticoMinutos: 7 }

  assert.equal(computeAtendimentoStatus(1 * 60 * 1000 + 59_999, thresholds), 'normal')
  assert.equal(computeAtendimentoStatus(2 * 60 * 1000, thresholds), 'atencao')
  assert.equal(computeAtendimentoStatus(6 * 60 * 1000 + 59_999, thresholds), 'atencao')
  assert.equal(computeAtendimentoStatus(7 * 60 * 1000, thresholds), 'critico')
})

test('rejects invalid threshold pairs and falls back to the sector defaults', () => {
  assert.equal(isValidAtendimentoStatusThresholds({ atencaoMinutos: 10, criticoMinutos: 10 }), false)
  assert.equal(isValidAtendimentoStatusThresholds({ atencaoMinutos: 0, criticoMinutos: 10 }), false)
  assert.equal(computeAtendimentoStatus(30 * 60 * 1000, { atencaoMinutos: 10, criticoMinutos: 10 }), 'atencao')
})

test('missing, negative, or invalid elapsed time is always normal — never crashes into a false alert', () => {
  assert.equal(computeAtendimentoStatus(null), 'normal')
  assert.equal(computeAtendimentoStatus(undefined), 'normal')
  assert.equal(computeAtendimentoStatus(-1), 'normal')
  assert.equal(computeAtendimentoStatus(Number.NaN), 'normal')
})

test('labels are in Portuguese, matching the requested tiers', () => {
  assert.equal(formatAtendimentoStatusLabel('normal'), 'Normal')
  assert.equal(formatAtendimentoStatusLabel('atencao'), 'Atenção')
  assert.equal(formatAtendimentoStatusLabel('critico'), 'Crítico')
})

test('badge classes never overlap between levels', () => {
  const classes = ['normal', 'atencao', 'critico'].map((level) => atendimentoStatusBadgeClass(level))
  assert.equal(new Set(classes).size, 3)
})
