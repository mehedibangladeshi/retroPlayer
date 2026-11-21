import { test } from 'node:test'
import assert from 'node:assert/strict'
import { editAlbum, parseAlbumCustom, parseRack, record, spineCrop, view, type RackFile } from '../src/main/rack.ts'
import { SPINE_ASPECT } from '../src/shared/rack.ts'

const base = { dir: '/a', text: 'A', image: null, bg: '#102030', ink: '#ffffff' }
const old = { ...base, lastUsed: 1 }

test('old rack.json entries without design/custom still parse', () => {
  const f = parseRack({ sort: 'recent', entries: [old] })
  assert.equal(f.entries.length, 1)
  assert.equal(f.entries[0].design, undefined)
  assert.equal(f.entries[0].custom, undefined)
})

test('invalid design/custom fields are dropped, not the entry', () => {
  const f = parseRack({ entries: [{ ...old, design: 'neon', custom: { cover: '../x.jpg', ink: 'red', spineOffset: 2, text: '  ' } }] })
  assert.equal(f.entries.length, 1)
  assert.equal(f.entries[0].design, undefined)
  assert.equal(f.entries[0].custom, undefined)
  const g = parseRack({ entries: [{ ...old, design: 'red', ink: '#abcdef', custom: { cover: 'abcdef12.jpg', spineOffset: 0.2, ink: '#000000', text: ' hi ', bad: 1 } }] })
  assert.equal(g.entries[0].design, 'red')
  assert.deepEqual(g.entries[0].custom, { cover: 'abcdef12.jpg', spineOffset: 0.2, ink: '#000000', text: 'hi' })
})

test('parseAlbumCustom rejects path-like cover names and caps text', () => {
  for (const c of ['../x.jpg', '/a.jpg', 'a/b.jpg', 'abcdef12.gif', 'abcdef12.png', 'ab.jpg']) assert.equal(parseAlbumCustom({ cover: c }), undefined)
  assert.equal(parseAlbumCustom({ text: 'x'.repeat(300) })?.text?.length, 200)
  assert.equal(parseAlbumCustom(null), undefined)
})

test('record keeps design, custom and resume; assigns a design only when none', () => {
  const resume = { index: 1, path: '/a/1.flac', positionMs: 5 }
  const f: RackFile = { sort: 'recent', entries: [{ ...old, design: 'red', custom: { ink: '#000000' }, resume }] }
  const r = record(f, { ...base, text: 'new' }, 9, () => 0).entries[0]
  assert.deepEqual([r.design, r.custom, r.resume, r.text, r.lastUsed], ['red', { ink: '#000000' }, resume, 'new', 9])
  const fresh = record({ sort: 'recent', entries: [] }, base, 1, () => 0.5)
  assert.equal(fresh.entries[0].design, 'pastel-green')
  assert.equal(record(fresh, base, 2, () => 0).entries[0].design, 'pastel-green')
})

test('editAlbum replaces spine fields, design and custom; unknown dir is a no-op', () => {
  const f: RackFile = { sort: 'recent', entries: [{ ...old, design: 'red' }] }
  const e = editAlbum(f, '/a', { ...base, text: 'T', bg: '#000000' }, 'blue', { text: 'T' }).entries[0]
  assert.deepEqual([e.text, e.bg, e.design, e.custom, e.lastUsed], ['T', '#000000', 'blue', { text: 'T' }, 1])
  assert.deepEqual(editAlbum(f, '/zzz', base, 'blue', {}), f)
})

test('view sends design (null when absent)', () => {
  const f: RackFile = { sort: 'recent', entries: [{ ...old, design: 'cream' }, { ...old, dir: '/b' }] }
  assert.deepEqual(view(f).spines.map((s) => s.design).sort(), ['cream', null])
})

test('spineCrop offset 0 / 0.5 / 1 and clamping', () => {
  const w = 1000
  const h = 1000
  const cw = Math.round(h * SPINE_ASPECT)
  assert.equal(spineCrop(w, h, 0).x, 0)
  assert.equal(spineCrop(w, h).x, Math.floor((w - cw) / 2))
  assert.equal(spineCrop(w, h, 1).x, w - cw)
  assert.equal(spineCrop(w, h, -3).x, 0)
  assert.equal(spineCrop(w, h, 9).x, w - cw)
  assert.equal(spineCrop(200, 2000, 1).y, 2000 - spineCrop(200, 2000, 1).height)
})
