import assert from 'node:assert/strict'
import test from 'node:test'
import {
  isExactSubsetorMatch,
  matchesAtendenteSubsetorFilter,
  sanitizeSubsetorFilterSelection,
  SEM_SUBSETOR_ID,
} from '../lib/subsetor-routing.ts'

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

test('empty selection accepts any attendant', () => {
  assert.equal(matchesAtendenteSubsetorFilter([], ['A']), true)
  assert.equal(matchesAtendenteSubsetorFilter([], []), true)
  assert.equal(matchesAtendenteSubsetorFilter([], null), true)
})

test('selecting A accepts attendant A and attendant A+B, but not B', () => {
  assert.equal(matchesAtendenteSubsetorFilter(['A'], ['A']), true)
  assert.equal(matchesAtendenteSubsetorFilter(['A'], ['A', 'B']), true)
  assert.equal(matchesAtendenteSubsetorFilter(['A'], ['B']), false)
})

test('selecting A+B applies union without duplicating the attendant', () => {
  const selected = ['A', 'B']
  assert.equal(matchesAtendenteSubsetorFilter(selected, ['A']), true)
  assert.equal(matchesAtendenteSubsetorFilter(selected, ['B']), true)
  assert.equal(matchesAtendenteSubsetorFilter(selected, ['A', 'B']), true)
  assert.equal(matchesAtendenteSubsetorFilter(selected, ['C']), false)
})

test('selecting A+B over a real attendant list yields exactly three unique ids, no duplicates', () => {
  const attendants = [
    { id: 'ana', subsetorIds: ['A'] },
    { id: 'bruno', subsetorIds: ['B'] },
    { id: 'carla', subsetorIds: ['A', 'B'] },
  ]
  const selected = ['A', 'B']

  const visible = attendants.filter((a) => matchesAtendenteSubsetorFilter(selected, a.subsetorIds))

  assert.deepEqual(visible.map((a) => a.id), ['ana', 'bruno', 'carla'])
  assert.equal(new Set(visible.map((a) => a.id)).size, 3)
})

test('"Sem subsetor" only accepts an attendant with no subsetor links', () => {
  assert.equal(matchesAtendenteSubsetorFilter([SEM_SUBSETOR_ID], []), true)
  assert.equal(matchesAtendenteSubsetorFilter([SEM_SUBSETOR_ID], null), true)
  assert.equal(matchesAtendenteSubsetorFilter([SEM_SUBSETOR_ID], ['A']), false)
})

test('A + "Sem subsetor" accepts both groups', () => {
  const selected = ['A', SEM_SUBSETOR_ID]
  assert.equal(matchesAtendenteSubsetorFilter(selected, ['A']), true)
  assert.equal(matchesAtendenteSubsetorFilter(selected, []), true)
  assert.equal(matchesAtendenteSubsetorFilter(selected, ['B']), false)
})

test('atendente filter and subsetor filter combine with AND (intersection), discriminating both dimensions', () => {
  const attendants = [
    { id: 'ana', subsetorIds: ['A'] },
    { id: 'bruno', subsetorIds: ['B'] },
    { id: 'carla', subsetorIds: ['A', 'B'] },
  ]
  // atendenteFilter alone keeps bruno+carla (excludes ana); subsetorFilter
  // alone keeps ana+carla (excludes bruno). Only the AND combination narrows
  // to carla — each filter must be doing real work, not a no-op.
  const atendenteFilter = ['bruno', 'carla']
  const subsetorFilter = ['A']

  const visible = attendants.filter((a) => (
    (atendenteFilter.length === 0 || atendenteFilter.includes(a.id))
    && matchesAtendenteSubsetorFilter(subsetorFilter, a.subsetorIds)
  ))

  assert.deepEqual(visible.map((a) => a.id), ['carla'])
})

test('sanitize discards a removed id when the loaded active list is empty', () => {
  assert.deepEqual(sanitizeSubsetorFilterSelection(['old-id'], []), [])
})

test('sanitize removes an inactive id but preserves an active id and SEM_SUBSETOR_ID', () => {
  const result = sanitizeSubsetorFilterSelection(['A', 'inactive-id', SEM_SUBSETOR_ID], ['A'])
  assert.deepEqual(result, ['A', SEM_SUBSETOR_ID])
})

test('sanitize returns the same reference when nothing needs to change', () => {
  const selected = ['A', SEM_SUBSETOR_ID]
  assert.strictEqual(sanitizeSubsetorFilterSelection(selected, ['A']), selected)
})

test('sanitize with an empty selection stays empty regardless of the active list', () => {
  assert.deepEqual(sanitizeSubsetorFilterSelection([], []), [])
  assert.deepEqual(sanitizeSubsetorFilterSelection([], ['A']), [])
})
