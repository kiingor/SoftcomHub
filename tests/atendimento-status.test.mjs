import assert from 'node:assert/strict'
import test from 'node:test'
import {
  computeAtendimentoStatus,
  formatAtendimentoStatusLabel,
  atendimentoStatusBadgeClass,
} from '../lib/atendimento-status.ts'

test('under 5min is normal', () => {
  assert.equal(computeAtendimentoStatus(0), 'normal')
  assert.equal(computeAtendimentoStatus(4 * 60 * 1000 + 59_000), 'normal')
})

test('flips to atencao exactly at 5min, not up to a minute late', () => {
  assert.equal(computeAtendimentoStatus(5 * 60 * 1000), 'atencao')
  assert.equal(computeAtendimentoStatus(5 * 60 * 1000 + 1), 'atencao')
})

test('flips to critico exactly at 10min', () => {
  assert.equal(computeAtendimentoStatus(9 * 60 * 1000 + 59_999), 'atencao')
  assert.equal(computeAtendimentoStatus(10 * 60 * 1000), 'critico')
  assert.equal(computeAtendimentoStatus(60 * 60 * 1000), 'critico')
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
