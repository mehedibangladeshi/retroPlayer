import { test } from 'node:test'
import assert from 'node:assert/strict'
import { MARQUEE_DELAY_MS, marquee } from '../src/renderer/src/views/marquee.ts'

test('a name that fits does not scroll', () => {
  assert.equal(marquee(300, 300), null)
  assert.equal(marquee(200, 300), null)
})
test('a name that overflows scrolls by the hidden width', () => {
  const m = marquee(500, 300)!
  assert.equal(m.shift, 200)
})
test('scroll speed is constant, with a floor on the duration', () => {
  assert.equal(marquee(500, 300)!.durationMs * 2, marquee(700, 300)!.durationMs)
  assert.ok(marquee(301, 300)!.durationMs >= 1000)
})
test('the marquee starts 400 ms after selection', () => {
  assert.equal(MARQUEE_DELAY_MS, 400)
})
