import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  knobRotation, dragVolume, stepVolume, seekAt, needleAngle, decay,
} from '../src/renderer/src/views/powerMath.ts'

test('knobRotation maps 0..1 to -225..45 with the baked pointer at 0.8333', () => {
  assert.equal(knobRotation(0), -225)
  assert.equal(knobRotation(1), 45)
  assert.ok(Math.abs(knobRotation(0.8333)) < 0.1)
})

test('dragVolume: up is louder, 200 px is the full range, clamped', () => {
  assert.equal(dragVolume(0.5, -100), 1)
  assert.equal(dragVolume(0.5, 100), 0)
  assert.ok(Math.abs(dragVolume(0.5, -20) - 0.6) < 1e-9)
  assert.equal(dragVolume(0.9, -500), 1)
  assert.equal(dragVolume(0.1, 500), 0)
})

test('stepVolume steps 0.05, clamps, and does not drift', () => {
  assert.equal(stepVolume(0.5, 1), 0.55)
  assert.equal(stepVolume(0.5, -1), 0.45)
  assert.equal(stepVolume(1, 1), 1)
  assert.equal(stepVolume(0, -1), 0)
  let v = 0
  for (let i = 0; i < 20; i++) v = stepVolume(v, 1)
  assert.equal(v, 1)
  for (let i = 0; i < 7; i++) v = stepVolume(v, -1)
  assert.equal(v, 0.65)
})

test('seekAt maps x to ms, clamps, and returns null without a duration', () => {
  const seek = { x: 20, w: 400 }
  assert.equal(seekAt(220, seek, 1000), 500)
  assert.equal(seekAt(0, seek, 1000), 0)
  assert.equal(seekAt(999, seek, 1000), 1000)
  assert.equal(seekAt(220, seek, null), null)
})

test('needleAngle maps dB -40..0 to min..max, clamped', () => {
  assert.equal(needleAngle(0, -200, -90), -200)
  assert.equal(needleAngle(1, -200, -90), -90)
  assert.ok(Math.abs(needleAngle(0.1, -200, -90) - -145) < 1e-9) // -20 dB is halfway
  assert.equal(needleAngle(5, -200, -90), -90)
})

test('decay rises at once and falls gradually', () => {
  assert.equal(decay(0.2, 0.8, 16), 0.8)
  const d = decay(0.8, 0.1, 100, 0.001)
  assert.ok(Math.abs(d - 0.7) < 1e-9)
  assert.equal(decay(0.5, 0.1, 1e6, 0.001), 0.1)
})
