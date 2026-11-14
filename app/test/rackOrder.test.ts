import { test } from 'node:test'
import assert from 'node:assert/strict'
import { moveDir } from '../src/renderer/src/views/rackOrder.ts'

// Drag-reorder on the rack: `to` is the insertion index (a gap) in the original list.
const d = ['a', 'b', 'c', 'd']
test('moveDir: moving right inserts before the target gap', () => {
  assert.deepEqual(moveDir(d, 0, 2), ['b', 'a', 'c', 'd'])
  assert.deepEqual(moveDir(d, 0, 4), ['b', 'c', 'd', 'a'])
})
test('moveDir: moving left', () => {
  assert.deepEqual(moveDir(d, 3, 0), ['d', 'a', 'b', 'c'])
  assert.deepEqual(moveDir(d, 2, 1), ['a', 'c', 'b', 'd'])
})
test('moveDir: dropping on its own gaps keeps the order, as a copy', () => {
  for (const to of [1, 2]) {
    const out = moveDir(d, 1, to)
    assert.deepEqual(out, d)
    assert.notEqual(out, d)
  }
})
test('moveDir: out-of-range indices clamp', () => {
  assert.deepEqual(moveDir(d, 0, 99), ['b', 'c', 'd', 'a'])
  assert.deepEqual(moveDir(d, 3, -5), ['d', 'a', 'b', 'c'])
  assert.deepEqual(moveDir(d, 99, 0), ['d', 'a', 'b', 'c'])
  assert.deepEqual(moveDir([], 0, 0), [])
})
