import { test } from 'node:test'
import assert from 'node:assert/strict'
import { nineSlice, stretchFit } from '../src/renderer/src/views/stretchFit.ts'

// Free windows (playlist, rack): the art scales by the tighter side and the composition grows to fill the window.
test('stretchFit: in its design shape it is a plain scale', () => {
  assert.deepEqual(stretchFit(468.5, 468.5, 937, 937), { scale: 0.5, w: 937, h: 937 })
})
test('stretchFit: a wider window grows the composition wide, at the scale its height sets', () => {
  assert.deepEqual(stretchFit(937, 468.5, 937, 937), { scale: 0.5, w: 1874, h: 937 })
})
test('stretchFit: a taller window grows it tall, at the scale its width sets', () => {
  assert.deepEqual(stretchFit(468.5, 937, 937, 937), { scale: 0.5, w: 937, h: 1874 })
})
test('stretchFit: shaded (the window is only its bar), its height sets the scale and the width follows the window', () => {
  assert.deepEqual(stretchFit(937, 32, 937, 937, 64), { scale: 0.5, w: 1874, h: 937 })
  // An aspect window's bar is width x barH/designW: the same scale as its width alone gives.
  assert.deepEqual(stretchFit(468.5, 32, 937, 937, 64), { scale: 0.5, w: 937, h: 937 })
})

test('nineSlice: drawn at whole screen pixels under the view scale, so the slices meet without seams', () => {
  // A 937x937 composition grown to 1000x937 at scale 0.5: the layer is 500x469 screen px, scaled back by 1/0.5.
  const s = nineSlice('a.png', { top: 100, right: 100, bottom: 75, left: 240 }, 2, { scale: 0.5, w: 1000, h: 937 })
  assert.equal(s.borderWidth, '50px 50px 38px 120px')
  assert.equal(s.borderImage, 'url("a.png") 200 200 150 480 fill / 50px 50px 38px 120px stretch')
  assert.deepEqual([s.width, s.height, s.transform], [500, 469, 'scale(2)'])
})
