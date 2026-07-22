import assert from 'node:assert/strict'
import test from 'node:test'
import { isExactSubsetorMatch } from '../lib/subsetor-routing.ts'

test('routes a tagged ticket only to an attendant linked to the same subsetor', () => {
  assert.equal(isExactSubsetorMatch('finance', ['finance']), true)
  assert.equal(isExactSubsetorMatch('finance', ['sales']), false)
  assert.equal(isExactSubsetorMatch('finance', []), false)
})

test('routes an untagged ticket only to an attendant without subsetor links', () => {
  assert.equal(isExactSubsetorMatch(null, []), true)
  assert.equal(isExactSubsetorMatch(null, ['finance']), false)
  assert.equal(isExactSubsetorMatch(null, ['sales']), false)
})
