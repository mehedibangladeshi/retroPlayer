import { test } from 'node:test'
import assert from 'node:assert/strict'
import { defaultPlayerSize, migrateSettings, LAYOUT_VERSION } from '../src/main/windowSize.ts'

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
  const s = { lastOpenDir: '/m', window: w, playlistWindow: w, albumWindow: w }
  assert.deepEqual(migrateSettings(s), { lastOpenDir: '/m', layoutVersion: LAYOUT_VERSION })
  assert.deepEqual(migrateSettings({ ...s, layoutVersion: 1 }), { lastOpenDir: '/m', layoutVersion: LAYOUT_VERSION })
  assert.deepEqual(migrateSettings({ ...s, layoutVersion: 2 }), { lastOpenDir: '/m', layoutVersion: LAYOUT_VERSION })
})

test('migrateSettings: keeps bounds at the current version', () => {
  const w = { x: 1, y: 2, width: 3, height: 4 }
  const s = { lastOpenDir: '/m', window: w, layoutVersion: LAYOUT_VERSION }
  assert.deepEqual(migrateSettings(s), s)
})
