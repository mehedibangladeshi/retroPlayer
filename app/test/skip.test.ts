import { test } from 'node:test'
import assert from 'node:assert/strict'
import { backAction } from '../src/renderer/src/input/skip.ts'

test('back restarts the track when more than 3 s in', () => {
  assert.equal(backAction(3001, 2), 'restart')
})
test('back goes to the previous track within the first 3 s', () => {
  assert.equal(backAction(3000, 2), 'prev')
  assert.equal(backAction(0, 1), 'prev')
})
test('back goes to the previous track on the first track of the play order, restarts with no album', () => {
  assert.equal(backAction(500, 0), 'prev')
  assert.equal(backAction(500, null), 'restart')
})
