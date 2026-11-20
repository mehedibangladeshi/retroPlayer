import { test } from 'node:test'
import assert from 'node:assert/strict'
import { CHROME_SCALE, chromeBarPx } from '../src/shared/chrome.ts'

test('chromeBarPx is the design bar height at the fixed chrome scale', () => {
  assert.equal(CHROME_SCALE, 0.55)
  assert.equal(chromeBarPx(64), 35.2)
})
