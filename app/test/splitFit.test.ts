import { test } from 'node:test'
import assert from 'node:assert/strict'
import { barSlice, splitFit } from '../src/renderer/src/views/splitFit.ts'
import { CHROME_SCALE, chromeBarPx } from '../src/shared/chrome.ts'

// Album: design 937x937, bar 62. The main process holds winW / (winH - bar) = designW / (designH - barH).
const bodyH = (winW: number): number => (winW * (937 - 62)) / 937
test('splitFit: the bar is the same on-screen size at any window width', () => {
  const a = splitFit(400, Math.round(chromeBarPx(62) + bodyH(400)), 937, 937, 62)
  const b = splitFit(900, Math.round(chromeBarPx(62) + bodyH(900)), 937, 937, 62)
  assert.equal(a.barPx, b.barPx)
  assert.equal(a.barPx, Math.round(62 * CHROME_SCALE))
})
test('splitFit: the body scales by the width and sits right under the bar', () => {
  const f = splitFit(468.5, chromeBarPx(62) + bodyH(468.5), 937, 937, 62)
  assert.ok(Math.abs(f.scale - 0.5) < 1e-9)
  assert.equal(f.top, f.barPx)
  assert.ok(Math.abs(f.left) < 1e-9)
})
test('splitFit: bar plus body fills a window that follows the contract aspect', () => {
  const winW = 600
  const f = splitFit(winW, chromeBarPx(62) + bodyH(winW), 937, 937, 62)
  assert.ok(Math.abs(f.barPx + (937 - 62) * f.scale - (chromeBarPx(62) + bodyH(winW))) < 0.5)
})
test('splitFit: a 2 px too-short window letterboxes the body instead of overflowing', () => {
  const f = splitFit(600, chromeBarPx(62) + bodyH(600) - 2, 937, 937, 62)
  assert.ok(f.scale < 600 / 937)
  assert.ok(f.barPx + (937 - 62) * f.scale <= chromeBarPx(62) + bodyH(600) - 2 + 1e-9)
  assert.ok(f.left > 0)
})
test('barSlice: caps and bar height are fixed screen px, from the 2x art', () => {
  const s = barSlice('x.png', 937, 62, 40, 90, 2)
  assert.equal(s.borderWidth, `${Math.round(62 * CHROME_SCALE)}px ${Math.round(90 * CHROME_SCALE)}px 0px ${Math.round(40 * CHROME_SCALE)}px`)
  assert.match(s.borderImage, /124 180 1750 80 fill/)
})
import { titleLayer } from '../src/renderer/src/views/splitFit.ts'
test('titleLayer: the whole layer at CHROME_SCALE from the top-left, clipped to the bar, so design (x, y) lands at (x, y) * CHROME_SCALE', () => {
  const t = titleLayer(451, 934, 48)
  assert.equal(t.img.width, 451 * CHROME_SCALE)
  assert.equal(t.img.height, 934 * CHROME_SCALE)
  assert.equal(t.img.left, 0)
  assert.equal(t.img.top, 0)
  assert.equal(t.clip.height, Math.round(48 * CHROME_SCALE))
  // The title text (design y 17..38) sits fully inside the bar.
  assert.ok(38 * CHROME_SCALE <= t.clip.height)
})
