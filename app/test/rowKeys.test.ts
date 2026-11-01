import { test } from 'node:test'
import assert from 'node:assert/strict'
import { rowKeyAction } from '../src/renderer/src/views/rowKeys.ts'

test('Enter plays the focused row, even when another is selected', () => {
  assert.deepEqual(rowKeyAction('Enter', 3, 1, 5), { type: 'play', index: 3 })
})
test('Enter falls back to the selected row, or nothing', () => {
  assert.deepEqual(rowKeyAction('Enter', null, 2, 5), { type: 'play', index: 2 })
  assert.equal(rowKeyAction('Enter', null, -1, 5), null)
})
test('arrows select next/previous, clamped, from none', () => {
  assert.deepEqual(rowKeyAction('ArrowDown', null, 1, 5), { type: 'select', index: 2 })
  assert.deepEqual(rowKeyAction('ArrowDown', null, 4, 5), { type: 'select', index: 4 })
  assert.deepEqual(rowKeyAction('ArrowUp', null, 0, 5), { type: 'select', index: 0 })
  assert.deepEqual(rowKeyAction('ArrowDown', null, -1, 5), { type: 'select', index: 0 })
  assert.deepEqual(rowKeyAction('ArrowUp', null, -1, 5), { type: 'select', index: 4 })
  assert.equal(rowKeyAction('ArrowDown', null, -1, 0), null)
})
test('arrows start from the focused row when one has focus', () => {
  assert.deepEqual(rowKeyAction('ArrowDown', 3, 0, 5), { type: 'select', index: 4 })
  assert.deepEqual(rowKeyAction('ArrowUp', 0, 2, 5), { type: 'select', index: 0 })
})
test('other keys do nothing', () => {
  assert.equal(rowKeyAction('a', 1, 1, 5), null)
})
