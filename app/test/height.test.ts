import { test } from 'node:test'
import assert from 'node:assert/strict'
import { matchHeight } from '../src/main/dock.ts'

test('matchHeight: height is the player height, width follows the aspect', () => {
  assert.deepEqual(matchHeight(600, 1.5, 100), { width: 900, height: 600 })
})
test('matchHeight: width never goes below minWidth', () => {
  assert.deepEqual(matchHeight(462, 0.5, 320), { width: 320, height: 462 })
})
test('matchHeight: width is rounded', () => {
  assert.deepEqual(matchHeight(463, 0.9936, 100), { width: 460, height: 463 })
})
