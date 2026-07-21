import assert from 'node:assert/strict'
import test from 'node:test'
import {
  isExactSubsetorMatch,
  shouldRouteTransferToSupport,
} from '../lib/subsetor-routing.ts'

const baseTransfer = {
  destinationSetorId: null,
  destinationSubsetorId: null,
  destinationColaboradorId: null,
  currentSubsetorId: null,
}

test('routes a sector transfer without subsetor to Support', () => {
  assert.equal(shouldRouteTransferToSupport({
    ...baseTransfer,
    destinationSetorId: 'target-sector',
  }), true)

  assert.equal(shouldRouteTransferToSupport({
    ...baseTransfer,
    destinationSetorId: 'target-sector',
    currentSubsetorId: 'prime',
  }), true)
})

test('routes an untagged ticket returned to the current queue to Support', () => {
  assert.equal(shouldRouteTransferToSupport(baseTransfer), true)
})

test('preserves the current subsetor when returning to the same queue', () => {
  assert.equal(shouldRouteTransferToSupport({
    ...baseTransfer,
    currentSubsetorId: 'prime',
  }), false)
})

test('does not override an explicit subsetor or same-sector attendant destination', () => {
  assert.equal(shouldRouteTransferToSupport({
    ...baseTransfer,
    destinationSubsetorId: 'prime',
  }), false)
  assert.equal(shouldRouteTransferToSupport({
    ...baseTransfer,
    destinationColaboradorId: 'attendant',
  }), false)
})

test('routes a cross-sector attendant transfer without subsetor to Support', () => {
  assert.equal(shouldRouteTransferToSupport({
    ...baseTransfer,
    destinationSetorId: 'target-sector',
    destinationColaboradorId: 'attendant',
    currentSubsetorId: 'prime',
  }), true)
})

test('routes a Support ticket only to an attendant linked to Support', () => {
  assert.equal(isExactSubsetorMatch('support', ['support']), true)
  assert.equal(isExactSubsetorMatch('support', ['prime']), false)
  assert.equal(isExactSubsetorMatch('support', []), false)
})

test('routes an untagged ticket only to an attendant without subsetor links', () => {
  assert.equal(isExactSubsetorMatch(null, []), true)
  assert.equal(isExactSubsetorMatch(null, ['support']), false)
  assert.equal(isExactSubsetorMatch(null, ['prime']), false)
})
