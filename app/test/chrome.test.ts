import { test } from 'node:test'
import assert from 'node:assert/strict'
import { CHROME_SCALE, bodyAspect, chromeBarPx, heightForWidth, wholeAspect, widthForHeight } from '../src/shared/chrome.ts'

test('chromeBarPx is the design bar height at the fixed chrome scale', () => {
  assert.equal(CHROME_SCALE, 0.55)
  assert.equal(chromeBarPx(64), 35.2)
})

test('bodyAspect, heightForWidth and widthForHeight agree on the body ratio under a fixed bar', () => {
  const [w, h, bar] = [937, 937, 62]
  const a = bodyAspect(w, h, bar)
  assert.equal(a, 937 / 875)
  const winH = heightForWidth(600, w, h, bar)
  assert.equal(winH, 600 / a + chromeBarPx(bar))
  assert.ok(Math.abs(widthForHeight(winH, w, h, bar) - 600) < 1e-9)
})

test('wholeAspect is width / height of a bar window at a height, and 0 bar gives the plain aspect', () => {
  const a = bodyAspect(937, 937, 62)
  const h = 700
  assert.ok(Math.abs(wholeAspect(h, a, chromeBarPx(62)) - widthForHeight(h, 937, 937, 62) / h) < 1e-12)
  assert.equal(wholeAspect(500, 2, 0), 2)
})
