import { test } from 'node:test'
import assert from 'node:assert/strict'
import { extrapolate, holdTarget, noBackslide, stepHold } from '../src/renderer/src/engine/smoothPosition.ts'

test('extrapolate adds elapsed time while playing and clamps to duration', () => {
  assert.equal(extrapolate(1000, 100, 350, 10_000, true), 1250)
  assert.equal(extrapolate(9900, 0, 500, 10_000, true), 10_000)
  assert.equal(extrapolate(1000, 100, 350, null, true), 1250)
})
test('extrapolate does not move when not playing', () => {
  assert.equal(extrapolate(1000, 100, 5000, 10_000, false), 1000)
})
test('a small backslide while playing is suppressed, a big jump back is taken', () => {
  assert.equal(noBackslide(5000, 4900), 5000)
  assert.equal(noBackslide(5000, 5100), 5100)
  assert.equal(noBackslide(5000, 1000), 1000)
})
test('hold keeps the target until the engine catches up or times out', () => {
  assert.equal(holdTarget(8000, 2000, 0, 100), 8000)
  assert.equal(holdTarget(8000, 7700, 0, 100), null)
  assert.equal(holdTarget(8000, 2000, 0, 1500), null)
})
test('stepHold releases once and never re-holds when playback runs past the target', () => {
  let h = stepHold({ ms: 8000, at: 0 }, 2000, 100)
  assert.deepEqual(h, { ms: 8000, at: 0 })
  h = stepHold(h, 7800, 200)
  assert.equal(h, null)
  assert.equal(stepHold(h, 9000, 300), null)
})
