import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHoldMotor } from '../src/renderer/src/input/seekHold.ts'

function setup(): { calls: string[]; motor: ReturnType<typeof createHoldMotor> } {
  const calls: string[] = []
  return { calls, motor: createHoldMotor(() => calls.push('loop'), () => calls.push('stop'), () => calls.push('key')) }
}

test('a hold loops the motor once, however many repeats, then stops it once', () => {
  const { calls, motor } = setup()
  motor.begin()
  motor.begin()
  motor.end()
  assert.deepEqual(calls, ['loop', 'stop'])
})
test('a short click never begins a hold, so neither sound is sent', () => {
  const { calls, motor } = setup()
  motor.end()
  assert.deepEqual(calls, [])
})
test('ending twice (release then blur/status change) stops once', () => {
  const { calls, motor } = setup()
  motor.begin()
  motor.end()
  motor.end()
  assert.deepEqual(calls, ['loop', 'stop'])
})
test('a press alone plays the key sound once and no motor sound', () => {
  const { calls, motor } = setup()
  motor.press()
  assert.deepEqual(calls, ['key'])
})
test('a press followed by a hold plays the key once, loops the motor, then stops it', () => {
  const { calls, motor } = setup()
  motor.press()
  motor.begin()
  motor.end()
  assert.deepEqual(calls, ['key', 'loop', 'stop'])
})
