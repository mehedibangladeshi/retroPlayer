import { test } from 'node:test'
import assert from 'node:assert/strict'
import { dirArg, dirsArg, rackMenuTemplate } from '../src/main/rackIpc.ts'

test('dirArg: only a non-empty string', () => {
  assert.equal(dirArg('/a'), '/a')
  for (const v of ['', null, undefined, 5, ['/a'], {}]) assert.equal(dirArg(v), null)
})

test('dirsArg: a non-empty array of non-empty strings, capped', () => {
  assert.deepEqual(dirsArg(['/a', '/b']), ['/a', '/b'])
  for (const v of [[], ['/a', ''], ['/a', 3], '/a', null, {}]) assert.equal(dirsArg(v), null)
  assert.equal(dirsArg(Array.from({ length: 501 }, (_, i) => `/d${i}`)), null)
  assert.equal(dirsArg(Array.from({ length: 500 }, (_, i) => `/d${i}`))?.length, 500)
})

test('rackMenuTemplate: sort radios checked by the current sort, clicks report the mode', () => {
  const calls: string[] = []
  const t = rackMenuTemplate('custom', false, 0, { setSort: (s) => calls.push(s), remove: () => calls.push('remove'), clear: () => calls.push('clear') })
  assert.equal(t.length, 4)
  assert.deepEqual(t.slice(0, 2).map((i) => [i.label, i.type, i.checked]), [['Sort: Recent', 'radio', false], ['Sort: Custom', 'radio', true]])
  for (const i of t.slice(0, 2)) (i.click as () => void)()
  assert.deepEqual(calls, ['recent', 'custom'])
})

test('rackMenuTemplate: a spine under the pointer adds Remove from rack', () => {
  let removed = 0
  const t = rackMenuTemplate('recent', true, 3, { setSort: () => {}, remove: () => removed++, clear: () => {} })
  assert.equal(t[0].checked, true)
  assert.equal(t[2].type, 'separator')
  assert.equal(t[3].label, 'Remove from rack')
  ;(t[3].click as () => void)()
  assert.equal(removed, 1)
})

test('rackMenuTemplate: Clear cassette rack is disabled with no cassettes, enabled otherwise, in both branches', () => {
  let cleared = 0
  const acts = { setSort: () => {}, remove: () => {}, clear: () => cleared++ }
  for (const hasDir of [false, true]) {
    const empty = rackMenuTemplate('recent', hasDir, 0, acts).at(-1)!
    assert.equal(empty.label, 'Clear cassette rack…')
    assert.equal(empty.enabled, false)
    const full = rackMenuTemplate('recent', hasDir, 2, acts)
    assert.equal(full.at(-2)!.type, 'separator')
    assert.equal(full.at(-1)!.enabled, true)
    ;(full.at(-1)!.click as () => void)()
  }
  assert.equal(cleared, 2)
})
