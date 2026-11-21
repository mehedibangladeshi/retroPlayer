import { test } from 'node:test'
import assert from 'node:assert/strict'
import { lockHeightAfterResize } from '../src/main/resizeEnd.ts'

test('a bar window corrected at resize end is re-locked at the corrected height', () => {
  const cur = { x: 0, y: 0, width: 220, height: 336 }
  const fixed = { x: 0, y: 0, width: 225, height: 468 }
  assert.equal(lockHeightAfterResize(26.4, cur, fixed), 468)
})

test('a bar window that needed no correction stays locked at its own height', () => {
  const cur = { x: 0, y: 0, width: 155, height: 336 }
  assert.equal(lockHeightAfterResize(26.4, cur, null), 336)
})

test('a window without a bar has no native lock to refresh', () => {
  const cur = { x: 0, y: 0, width: 155, height: 336 }
  assert.equal(lockHeightAfterResize(0, cur, cur), null)
})
