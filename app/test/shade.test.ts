import { test } from 'node:test'
import assert from 'node:assert/strict'
import { clampInto, expandedAt, shadedBounds } from '../src/main/shade.ts'

test('shadedBounds keeps x, y, width and sets the bar height at the fixed chrome scale', () => {
  assert.deepEqual(shadedBounds({ x: 10, y: 20, width: 937, height: 700 }, 937, 80), { x: 10, y: 20, width: 937, height: Math.round(80 * 0.55) })
  assert.deepEqual(shadedBounds({ x: 0, y: 5, width: 468, height: 500 }, 937, 80), { x: 0, y: 5, width: 468, height: Math.round(80 * 0.55) })
})

test('shadedBounds: the shaded bar height does not depend on the window size', () => {
  // 1200x308 rack and 2000x1000 rack (design 1623x936, bar 64) both roll up to the same bar.
  const bar = Math.round(64 * 0.55)
  assert.deepEqual(shadedBounds({ x: 0, y: 0, width: 1200, height: 308 }, 1623, 64, 936), { x: 0, y: 0, width: 1200, height: bar })
  assert.deepEqual(shadedBounds({ x: 0, y: 0, width: 2000, height: 1000 }, 1623, 64, 936), { x: 0, y: 0, width: 2000, height: bar })
  // Taller than its shape: still the same bar.
  assert.deepEqual(shadedBounds({ x: 0, y: 0, width: 468, height: 900 }, 937, 80, 937), { x: 0, y: 0, width: 468, height: Math.round(80 * 0.55) })
})

test('expandedAt takes position from current and size from expanded', () => {
  assert.deepEqual(expandedAt({ x: 5, y: 6, width: 100, height: 40 }, { x: 1, y: 2, width: 300, height: 400 }), { x: 5, y: 6, width: 300, height: 400 })
})

test('clampInto pulls a rect back inside the area', () => {
  const area = { x: 0, y: 0, width: 1000, height: 800 }
  assert.deepEqual(clampInto({ x: 900, y: 700, width: 300, height: 400 }, area), { x: 700, y: 400, width: 300, height: 400 })
  assert.deepEqual(clampInto({ x: -50, y: -5, width: 300, height: 400 }, area), { x: 0, y: 0, width: 300, height: 400 })
  assert.deepEqual(clampInto({ x: 10, y: 10, width: 300, height: 400 }, area), { x: 10, y: 10, width: 300, height: 400 })
})
