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
  const t = rackMenuTemplate('custom', false, { setSort: (s) => calls.push(s), remove: () => calls.push('remove') })
  assert.equal(t.length, 2)
  assert.deepEqual(t.map((i) => [i.label, i.type, i.checked]), [['Sort: Recent', 'radio', false], ['Sort: Custom', 'radio', true]])
  for (const i of t) (i.click as () => void)()
  assert.deepEqual(calls, ['recent', 'custom'])
})

test('rackMenuTemplate: a spine under the pointer adds Remove from rack', () => {
  let removed = 0
  const t = rackMenuTemplate('recent', true, { setSort: () => {}, remove: () => removed++ })
  assert.equal(t[0].checked, true)
  assert.equal(t[2].type, 'separator')
  assert.equal(t[3].label, 'Remove from rack')
  ;(t[3].click as () => void)()
  assert.equal(removed, 1)
})
