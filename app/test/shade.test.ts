import { test } from 'node:test'
import assert from 'node:assert/strict'
import { clampInto, expandedAt, shadedBounds } from '../src/main/shade.ts'

test('shadedBounds keeps x, y, width and scales the bar height', () => {
  assert.deepEqual(shadedBounds({ x: 10, y: 20, width: 937, height: 700 }, 937, 80), { x: 10, y: 20, width: 937, height: 80 })
  assert.deepEqual(shadedBounds({ x: 0, y: 5, width: 468, height: 500 }, 937, 80), { x: 0, y: 5, width: 468, height: 40 })
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
