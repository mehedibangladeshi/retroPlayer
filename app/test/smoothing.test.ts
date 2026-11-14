import { test } from 'node:test'
import assert from 'node:assert/strict'
import { smoothBands, wavePoints } from '../src/renderer/src/views/power/smoothing.ts'

test('smoothBands rises at once, falls gradually, and pads to the band count', () => {
  const out = smoothBands([0.2, 0.8], [0.5, 0.1], 100, 0.002, 3)
  assert.deepEqual(out.map((v) => Math.round(v * 1000) / 1000), [0.5, 0.6, 0])
})

test('wavePoints spans the width, centred, and a flat wave is a flat line', () => {
  assert.equal(wavePoints([0, 0, 0], 100, 40), '0.0,20.0 50.0,20.0 100.0,20.0')
  assert.equal(wavePoints([1, -1], 10, 10), '0.0,0.0 10.0,10.0')
  assert.equal(wavePoints([], 10, 10), '0.0,5.0 10.0,5.0')
})
