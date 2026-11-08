import { test } from 'node:test'
import assert from 'node:assert/strict'
import { textMetrics } from '../src/renderer/src/views/playlistText.ts'

// The view scales its design composition by `scale`; text sizes are divided by it so they stay fixed on screen.
for (const scale of [308 / 937, 616 / 937, 924 / 937]) {
  test(`text is the same on screen at scale ${scale.toFixed(2)}`, () => {
    const m = textMetrics(scale)
    assert.ok(Math.abs(m.heading * scale - 16) < 1e-9)
    assert.ok(Math.abs(m.row * scale - 13) < 1e-9)
    assert.ok(Math.abs(m.pitch * scale - 17) < 1e-9) // round(13 * 1.3)
  })
}
test('a custom size (a future setting) scales the same way', () => {
  const m = textMetrics(0.5, { heading: 20, row: 15, lineHeight: 1.3 })
  assert.deepEqual(m, { heading: 40, row: 30, pitch: 40 })
})
