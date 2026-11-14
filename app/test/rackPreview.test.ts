import { test } from 'node:test'
import assert from 'node:assert/strict'
import { previewPlacement } from '../src/renderer/src/views/rackPreview.ts'

const view = { scrollLeft: 0, width: 1000 }

test('the preview opens to the right of the spine when it fits in the visible shelf', () => {
  assert.deepEqual(previewPlacement({ left: 100, width: 50 }, view, 400), { left: 150, side: 'right' })
  assert.deepEqual(previewPlacement({ left: 550, width: 50 }, view, 400), { left: 600, side: 'right' }) // exactly fits
})

test('the preview flips to the left of the spine when the right side has no room', () => {
  assert.deepEqual(previewPlacement({ left: 700, width: 50 }, view, 400), { left: 300, side: 'left' })
  assert.deepEqual(previewPlacement({ left: 1700, width: 50 }, { scrollLeft: 900, width: 1000 }, 400), { left: 1300, side: 'left' })
})

test('a left-side preview never starts before the visible shelf', () => {
  assert.deepEqual(previewPlacement({ left: 950, width: 50 }, { scrollLeft: 700, width: 600 }, 400), { left: 700, side: 'left' })
})
