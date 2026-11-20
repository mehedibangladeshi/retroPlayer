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

test('knobVolume is null while the engine options are unknown, else the volume', async () => {
  const { knobVolume } = await import('../src/renderer/src/views/power/knobValue.ts')
  assert.equal(knobVolume(false, 1, null), null)
  assert.equal(knobVolume(true, 0.3, null), 0.3)
  assert.equal(knobVolume(false, 1, { value: 0.5, at: 0 }), 0.5) // the user's own value is real
})
