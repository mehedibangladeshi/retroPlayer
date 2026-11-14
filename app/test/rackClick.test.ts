import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PREVIEW_DELAY_MS, spineClick, spineKey } from '../src/renderer/src/views/rackClick.ts'

test('single click previews, second click plays', () => {
  assert.equal(spineClick(1, false), 'preview')
  assert.equal(spineClick(2, false), 'play')
  assert.equal(spineClick(3, false), null) // a triple-click must not restart the album
})

test('a drag or a keyboard-synthesised click (detail 0) does nothing', () => {
  assert.equal(spineClick(1, true), null)
  assert.equal(spineClick(2, true), null)
  assert.equal(spineClick(0, false), null)
})

test('Enter plays, Space previews, other keys ignored', () => {
  assert.equal(spineKey('Enter'), 'play')
  assert.equal(spineKey(' '), 'preview')
  assert.equal(spineKey('a'), null)
})

test('preview delay falls back to 500 ms', () => assert.equal(PREVIEW_DELAY_MS, 500))
