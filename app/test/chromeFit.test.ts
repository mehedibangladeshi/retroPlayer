import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromeFit } from '../src/renderer/src/views/chromeFit.ts'
import { nineSlice } from '../src/renderer/src/views/stretchFit.ts'
import { CHROME_SCALE } from '../src/shared/chrome.ts'

// Playlist and rack: the whole composition is drawn at CHROME_SCALE; resizing grows it in design px.
test('chromeFit: the scale is the same at every window size, the composition grows with the window', () => {
  const a = chromeFit(600, 600, { w: 400, h: 340 })
  const b = chromeFit(1200, 900, { w: 400, h: 340 })
  assert.equal(a.scale, CHROME_SCALE)
  assert.equal(b.scale, CHROME_SCALE)
  assert.ok(b.w > a.w && b.h > a.h)
  assert.equal(b.w, 1200 / CHROME_SCALE)
  assert.equal(b.h, 900 / CHROME_SCALE)
})
test('chromeFit: border and bar px are identical at two window sizes', () => {
  const slice = { top: 100, right: 100, bottom: 75, left: 240 }
  const bw = (w: number, h: number) => nineSlice('a.png', slice, 2, chromeFit(w, h, { w: 400, h: 340 })).borderWidth
  assert.equal(bw(700, 700), bw(1500, 800))
})
test('chromeFit: a window below the design shrinks the composition, down to the minimum', () => {
  assert.deepEqual(chromeFit(300, 250, { w: 400, h: 340 }), { scale: CHROME_SCALE, w: 300 / CHROME_SCALE, h: 250 / CHROME_SCALE })
  assert.deepEqual(chromeFit(100, 100, { w: 400, h: 340 }), { scale: CHROME_SCALE, w: 400, h: 340 })
})
test('chromeFit: shaded, only the bar shows and the width still follows the window', () => {
  assert.deepEqual(chromeFit(1200, 41, { w: 400, h: 340 }, true), { scale: CHROME_SCALE, w: 1200 / CHROME_SCALE, h: 340 })
})
