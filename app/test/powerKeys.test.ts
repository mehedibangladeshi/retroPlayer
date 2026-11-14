import { test } from 'node:test'
import assert from 'node:assert/strict'
import { powerKeyAction } from '../src/renderer/src/input/powerKeys.ts'

test('keys map to power actions, either case', () => {
  assert.equal(powerKeyAction({ key: 'ArrowUp' }), 'volumeUp')
  assert.equal(powerKeyAction({ key: 'ArrowDown' }), 'volumeDown')
  assert.equal(powerKeyAction({ key: 'l' }), 'loop')
  assert.equal(powerKeyAction({ key: 'L' }), 'loop')
  assert.equal(powerKeyAction({ key: 's' }), 'shuffle')
  assert.equal(powerKeyAction({ key: 'S' }), 'shuffle')
  assert.equal(powerKeyAction({ key: 'v' }), 'visualizer')
  assert.equal(powerKeyAction({ key: 'V' }), 'visualizer')
  assert.equal(powerKeyAction({ key: 'x' }), null)
})
test('any modifier gives null', () => {
  for (const m of ['ctrlKey', 'metaKey', 'altKey'] as const) {
    assert.equal(powerKeyAction({ key: 'ArrowUp', [m]: true }), null)
    assert.equal(powerKeyAction({ key: 'l', [m]: true }), null)
  }
})
test('repeat only counts for volume', () => {
  assert.equal(powerKeyAction({ key: 'ArrowUp', repeat: true }), 'volumeUp')
  assert.equal(powerKeyAction({ key: 'ArrowDown', repeat: true }), 'volumeDown')
  for (const key of ['l', 's', 'v']) assert.equal(powerKeyAction({ key, repeat: true }), null)
})
