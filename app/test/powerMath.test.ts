import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  knobRotation, pointerAngle, turnVolume, stepVolume, seekAt, needleAngle, decay, angleVolume,
} from '../src/renderer/src/views/powerMath.ts'

test('knobRotation maps 0..1 to -225..45 with the baked pointer at 0.8333', () => {
  assert.equal(knobRotation(0), -225)
  assert.equal(knobRotation(1), 45)
  assert.ok(Math.abs(knobRotation(0.8333)) < 0.1)
})

test('pointerAngle: degrees from straight up, clockwise positive; null near the centre', () => {
  assert.equal(pointerAngle(0, -50), 0)
  assert.equal(pointerAngle(50, 0), 90)
  assert.equal(Math.abs(pointerAngle(0, 50) as number), 180)
  assert.equal(pointerAngle(-50, 0), -90)
  assert.equal(pointerAngle(3, 3), null)
})

test('turnVolume: follows the angle change, wraps the seam, clamps at both stops', () => {
  const near = (a: number, b: number): void => assert.ok(Math.abs(a - b) < 1e-9, `${a} vs ${b}`)
  near(turnVolume(0.5, 0, 27), 0.6)
  near(turnVolume(0.5, 27, 0), 0.4)
  near(turnVolume(0.5, 170, -170), 0.5 + 20 / 270) // clockwise across the seam
  near(turnVolume(0.5, -170, 170), 0.5 - 20 / 270) // anticlockwise across the seam
  assert.equal(turnVolume(0.95, 0, 90), 1)
  assert.equal(turnVolume(0.05, 0, -90), 0)
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

test('angleVolume: a click around the knob turns it to that angle', () => {
  const near = (a: number, b: number): void => assert.ok(Math.abs(a - b) < 1e-9, `${a} vs ${b}`)
  near(angleVolume(0, -50) as number, 0.5) // straight up = 5
  near(angleVolume(50, 0) as number, 225 / 270) // 3 o'clock = the baked pointer
  near(angleVolume(-50, 50) as number, 0) // 0 mark (lower left)
  near(angleVolume(50, 50) as number, 1) // 10 mark (lower right)
  assert.equal(angleVolume(-10, 100), 0) // dead zone at the bottom snaps to the nearer end
  assert.equal(angleVolume(10, 100), 1)
  assert.equal(angleVolume(1, 1), null) // too close to the centre to have an angle
})
