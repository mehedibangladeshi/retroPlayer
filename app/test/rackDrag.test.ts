import { test } from 'node:test'
import assert from 'node:assert/strict'
import { dragGhostBox } from '../src/renderer/src/views/rackDrag.ts'

const rect = { width: 100, height: 400, left: 50, top: 20 }

test('ghost is 1.05x the on-screen rect', () => {
  const b = dragGhostBox(rect, 50, 20)
  assert.equal(b.w, 105)
  assert.equal(b.h, 420)
})

test('grab offset scales so the grab point stays under the cursor', () => {
  const b = dragGhostBox(rect, 90, 220)
  assert.equal(b.ox, 42) // 40 * 1.05
  assert.equal(b.oy, 210) // 200 * 1.05
})

test('values are rounded to integers', () => {
  const b = dragGhostBox({ width: 33, height: 77, left: 0, top: 0 }, 7, 9)
  assert.deepEqual(b, { w: 35, h: 81, ox: 7, oy: 9 })
})

test('k is overridable', () => {
  assert.equal(dragGhostBox(rect, 50, 20, 1).w, 100)
})
