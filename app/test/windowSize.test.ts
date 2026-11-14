import { test } from 'node:test'
import assert from 'node:assert/strict'
import { defaultPlayerSize, migrateSettings, proportional, sizeLimits, LAYOUT_VERSION } from '../src/main/windowSize.ts'

const A = 767 / 616

test('defaultPlayerSize: 25% of width on common displays', () => {
  assert.deepEqual(defaultPlayerSize({ width: 1920, height: 1080 }, A, 384), { width: 480, height: Math.round(480 / A) })
  assert.deepEqual(defaultPlayerSize({ width: 2560, height: 1440 }, A, 384), { width: 640, height: Math.round(640 / A) })
})

test('defaultPlayerSize: min width 384 wins on small displays', () => {
  assert.equal(defaultPlayerSize({ width: 1366, height: 768 }, A, 384).width, 384)
})

test('defaultPlayerSize: height cap wins on short wide areas', () => {
  const s = defaultPlayerSize({ width: 3000, height: 500 }, A, 384)
  assert.equal(s.width, Math.floor(0.8 * 500 * A))
  assert.ok(s.height <= 0.8 * 500 + 1)
})

test('migrateSettings: drops bounds when version missing or old, keeps the rest', () => {
  const w = { x: 1, y: 2, width: 3, height: 4 }
  const s = { lastOpenDir: '/m', window: w, playlistWindow: w, albumWindow: w, rackWindow: w, powerWindow: w }
  assert.deepEqual(migrateSettings(s), { lastOpenDir: '/m', layoutVersion: LAYOUT_VERSION })
  assert.deepEqual(migrateSettings({ ...s, layoutVersion: 1 }), { lastOpenDir: '/m', layoutVersion: LAYOUT_VERSION })
  assert.deepEqual(migrateSettings({ ...s, layoutVersion: 2 }), { lastOpenDir: '/m', layoutVersion: LAYOUT_VERSION })
})

test('migrateSettings: keeps bounds at the current version', () => {
  const w = { x: 1, y: 2, width: 3, height: 4 }
  const s = { lastOpenDir: '/m', window: w, layoutVersion: LAYOUT_VERSION }
  assert.deepEqual(migrateSettings(s), s)
})

// Every window shares one height range (50%..150% of the player's design height); widths follow each window's aspect.
test('sizeLimits: the same height range for every window, widths from its aspect', () => {
  assert.deepEqual(sizeLimits(767 / 616), { minWidth: 384, minHeight: 308, maxWidth: 1151, maxHeight: 924 })
  assert.deepEqual(sizeLimits(1), { minWidth: 308, minHeight: 308, maxWidth: 924, maxHeight: 924 })
})

const L = sizeLimits(1)
const rest = { x: 100, y: 100, width: 400, height: 400 }
test('proportional: a width drag sets the height', () => {
  assert.deepEqual(proportional({ x: 100, y: 100, width: 480, height: 400 }, rest, 1, L), { x: 100, y: 100, width: 480, height: 480 })
})
test('proportional: a height drag sets the width', () => {
  assert.deepEqual(proportional({ x: 100, y: 100, width: 400, height: 350 }, rest, 1, L), { x: 100, y: 100, width: 350, height: 350 })
})
test('proportional: a left edge drag keeps the right edge, a top edge drag the bottom edge', () => {
  assert.deepEqual(proportional({ x: 60, y: 100, width: 440, height: 400 }, rest, 1, L), { x: 60, y: 100, width: 440, height: 440 })
  assert.deepEqual(proportional({ x: 100, y: 150, width: 400, height: 350 }, rest, 1, L), { x: 100, y: 150, width: 350, height: 350 })
  // A top-left corner drag that ends off proportion: the bottom-right corner stays put.
  assert.deepEqual(proportional({ x: 40, y: 80, width: 460, height: 420 }, rest, 1, L), { x: 40, y: 40, width: 460, height: 460 })
})
test('proportional: clamped to the limits', () => {
  assert.deepEqual(proportional({ x: 100, y: 100, width: 2000, height: 400 }, rest, 1, L), { x: 100, y: 100, width: 924, height: 924 })
  assert.deepEqual(proportional({ x: 100, y: 100, width: 100, height: 400 }, rest, 1, L), { x: 100, y: 100, width: 308, height: 308 })
})
test('proportional: a size already in proportion is left alone', () => {
  assert.deepEqual(proportional({ x: 5, y: 6, width: 767, height: 616 }, { x: 5, y: 6, width: 384, height: 308 }, 767 / 616, sizeLimits(767 / 616)), { x: 5, y: 6, width: 767, height: 616 })
})
test('proportional: a window manager rounding (within 2 px of the aspect) is left alone', () => {
  const cur = { x: 1, y: 2, width: 480, height: 387 } // openbox's aspect rounding of 480x386
  assert.deepEqual(proportional(cur, { x: 1, y: 2, width: 480, height: 386 }, 767 / 616, sizeLimits(767 / 616)), cur)
})
