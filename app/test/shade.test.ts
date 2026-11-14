import { test } from 'node:test'
import assert from 'node:assert/strict'
import { clampInto, expandedAt, shadedBounds } from '../src/main/shade.ts'

test('shadedBounds keeps x, y, width and scales the bar height', () => {
  assert.deepEqual(shadedBounds({ x: 10, y: 20, width: 937, height: 700 }, 937, 80), { x: 10, y: 20, width: 937, height: 80 })
  assert.deepEqual(shadedBounds({ x: 0, y: 5, width: 468, height: 500 }, 937, 80), { x: 0, y: 5, width: 468, height: 40 })
})

test('shadedBounds: a window wider than its design shape keeps the bar at the scale its height sets', () => {
  // 1200x308 rack (design 1623x936, bar 64): the art is drawn at 308/936, so the bar is 64*308/936 = 21 px tall.
  assert.deepEqual(shadedBounds({ x: 0, y: 0, width: 1200, height: 308 }, 1623, 64, 936), { x: 0, y: 0, width: 1200, height: 21 })
  // Taller than its shape: the width sets the scale, as before.
  assert.deepEqual(shadedBounds({ x: 0, y: 0, width: 468, height: 900 }, 937, 80, 937), { x: 0, y: 0, width: 468, height: 40 })
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
