import assert from 'node:assert/strict'
import test from 'node:test'

const { POLL_BASE_MS, POLL_MAX_MS, calcularProximoIntervalo } = await import(
  '../lib/poll-intervalo.ts'
)

test('servidor rápido mantém o intervalo na base', () => {
  assert.equal(calcularProximoIntervalo(0), POLL_BASE_MS)
  assert.equal(calcularProximoIntervalo(200), POLL_BASE_MS)
  // 1,5s x2 = 3s: ainda é a base, não afasta.
  assert.equal(calcularProximoIntervalo(1500), POLL_BASE_MS)
})

test('servidor lento afasta o próximo ciclo', () => {
  // O caso do widget em 18/08/2026: endpoint levando 4s com poll fixo de 3s.
  assert.equal(calcularProximoIntervalo(4000), 8000)
  assert.equal(calcularProximoIntervalo(2000), 4000)
})

test('o afastamento tem teto', () => {
  assert.equal(calcularProximoIntervalo(60_000), POLL_MAX_MS)
  assert.equal(calcularProximoIntervalo(Number.MAX_SAFE_INTEGER), POLL_MAX_MS)
})

test('duração inválida cai na base em vez de travar o chat', () => {
  assert.equal(calcularProximoIntervalo(Number.NaN), POLL_BASE_MS)
  assert.equal(calcularProximoIntervalo(-1), POLL_BASE_MS)
  assert.equal(calcularProximoIntervalo(Number.POSITIVE_INFINITY), POLL_BASE_MS)
})

test('base e teto são configuráveis pelo chamador', () => {
  assert.equal(calcularProximoIntervalo(100, 5000, 20_000), 5000)
  assert.equal(calcularProximoIntervalo(30_000, 5000, 20_000), 20_000)
})
