import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseVisualizerMode } from '../src/shared/api.ts'

test('visualizerMode keeps bars and wave', () => {
  assert.equal(parseVisualizerMode('bars'), 'bars')
  assert.equal(parseVisualizerMode('wave'), 'wave')
})

test('visualizerMode drops anything else', () => {
  for (const v of [undefined, null, '', 'Bars', 'spectrum', 1, true, {}]) assert.equal(parseVisualizerMode(v), undefined)
})
