import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DOUBLE_CLICK_FALLBACK_MS, parseDoubleClickMs, readDoubleClickMs } from '../src/main/dblclick.ts'

test('reg: reads DoubleClickSpeed from reg query output (CRLF)', () => {
  const out = '\r\nHKEY_CURRENT_USER\\Control Panel\\Mouse\r\n    DoubleClickSpeed    REG_SZ    500\r\n\r\n'
  assert.equal(parseDoubleClickMs('reg', out), 500)
  assert.equal(parseDoubleClickMs('reg', out.replace('500', '320')), 320)
})

test('defaults: seconds as a float become ms', () => {
  assert.equal(parseDoubleClickMs('defaults', '0.5\n'), 500)
  assert.equal(parseDoubleClickMs('defaults', '0.25\n'), 250)
})

test('kde: plain ms, empty (key unset) is null', () => {
  assert.equal(parseDoubleClickMs('kde', '400\n'), 400)
  assert.equal(parseDoubleClickMs('kde', ''), null)
  assert.equal(parseDoubleClickMs('kde', '\n'), null)
})

test('gsettings: plain or uint32-prefixed ms', () => {
  assert.equal(parseDoubleClickMs('gsettings', '400\n'), 400)
  assert.equal(parseDoubleClickMs('gsettings', 'uint32 400\n'), 400)
})

test('values are clamped to [150, 1000]', () => {
  assert.equal(parseDoubleClickMs('kde', '50'), 150)
  assert.equal(parseDoubleClickMs('kde', '5000'), 1000)
  assert.equal(parseDoubleClickMs('defaults', '3'), 1000)
})

test('garbage and zero are null', () => {
  assert.equal(parseDoubleClickMs('kde', 'abc'), null)
  assert.equal(parseDoubleClickMs('gsettings', '0'), null)
  assert.equal(parseDoubleClickMs('reg', 'ERROR: The system was unable to find the specified registry key or value.\r\n'), null)
  assert.equal(parseDoubleClickMs('defaults', 'The domain/default pair does not exist\n'), null)
})

test('unknown platform falls back to 500 without running anything', async () => {
  assert.equal(DOUBLE_CLICK_FALLBACK_MS, 500)
  assert.equal(await readDoubleClickMs('aix', {}), 500)
})
