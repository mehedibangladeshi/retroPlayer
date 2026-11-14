import { test } from 'node:test'
import assert from 'node:assert/strict'
import { shownVolume, settlePending } from '../src/renderer/src/views/power/knobValue.ts'

test('shown value is pending when set, else the engine volume', () => {
  assert.equal(shownVolume({ value: 0.7, at: 0 }, 0.3), 0.7)
  assert.equal(shownVolume(null, 0.3), 0.3)
})

test('pending stays until the engine echoes it', () => {
  const p = { value: 0.7, at: 0 }
  assert.equal(settlePending(p, 0.3, 100), p)
  assert.equal(settlePending(p, 0.7004, 100), null)
})

test('pending clears after the timeout if the echo is lost', () => {
  const p = { value: 0.7, at: 0 }
  assert.equal(settlePending(p, 0.3, 499), p)
  assert.equal(settlePending(p, 0.3, 500), null)
})

test('no pending stays null', () => {
  assert.equal(settlePending(null, 0.3, 1000), null)
})
