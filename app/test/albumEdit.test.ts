import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { coverName, coverTooLarge, editBounds, editState, planSave, EDIT_SIZE } from '../src/main/albumEdit.ts'
import { contextMenu } from '../src/main/contextMenu.ts'
import { rackMenuTemplate } from '../src/main/rackIpc.ts'
import { parseAlbumCustom, spineText, type RackEntry } from '../src/main/rack.ts'

const entry = (over: Partial<RackEntry> = {}): RackEntry => ({ dir: '/m/a', text: 'A', image: null, bg: '#112233', ink: '#ffffff', lastUsed: 1, ...over })
const bytes = Buffer.from([1, 2, 3, 4])

test('coverName: first 32 hex of the sha256 of the bytes, .jpg', () => {
  const name = coverName(bytes)
  assert.equal(name, createHash('sha256').update(bytes).digest('hex').slice(0, 32) + '.jpg')
  assert.match(name, /^[a-f0-9]{32}\.jpg$/)
})

test('planSave: a renderer-supplied custom.cover is ignored; the entry keeps its own cover when no token is sent', () => {
  const entries = [entry({ custom: { cover: 'aaaaaaaa.jpg' } })]
  const p = planSave({ dir: '/m/a', design: 'red', custom: { cover: 'bbbbbbbb.jpg', text: ' Hi ' } }, entries, null, parseAlbumCustom, '/m/a')
  assert.deepEqual(p, { dir: '/m/a', design: 'red', custom: { cover: 'aaaaaaaa.jpg', text: 'Hi' } })
})

test('planSave: no cover anywhere stays without one, even if the renderer names a file', () => {
  const p = planSave({ dir: '/m/a', design: 'red', custom: { cover: '../../etc/passwd', spineOffset: 0.2 } }, [entry()], null, parseAlbumCustom, '/m/a')
  assert.deepEqual(p, { dir: '/m/a', design: 'red', custom: { spineOffset: 0.2 } })
})

test('planSave: a matching token names the cover from its bytes and asks main to write them', () => {
  const p = planSave({ dir: '/m/a', design: 'blue', custom: {}, coverToken: 'tok' }, [entry({ custom: { cover: 'aaaaaaaa.jpg' } })], { token: 'tok', jpeg: bytes }, parseAlbumCustom, '/m/a')
  assert.deepEqual(p, { dir: '/m/a', design: 'blue', custom: { cover: coverName(bytes) }, write: { name: coverName(bytes), jpeg: bytes } })
})

test('planSave: an unknown token is rejected', () => {
  assert.throws(() => planSave({ dir: '/m/a', design: 'red', custom: {}, coverToken: 'nope' }, [entry()], { token: 'tok', jpeg: bytes }, parseAlbumCustom, '/m/a'))
  assert.throws(() => planSave({ dir: '/m/a', design: 'red', custom: {}, coverToken: 'tok' }, [entry()], null, parseAlbumCustom, '/m/a'))
  assert.throws(() => planSave({ dir: '/m/a', design: 'red', custom: {}, coverToken: 5 }, [entry()], { token: 'tok', jpeg: bytes }, parseAlbumCustom, '/m/a'))
})

test('planSave: an unknown dir, a bad design or a non-object is rejected', () => {
  assert.throws(() => planSave({ dir: '/m/other', design: 'red', custom: {} }, [entry()], null, parseAlbumCustom, '/m/a'))
  assert.throws(() => planSave({ dir: '/m/a', design: 'purple', custom: {} }, [entry()], null, parseAlbumCustom, '/m/a'))
  assert.throws(() => planSave(null, [entry()], null, parseAlbumCustom, '/m/a'))
  assert.throws(() => planSave('x', [entry()], null, parseAlbumCustom, '/m/a'))
})

test('planSave: invalid custom fields are dropped, a missing custom is empty', () => {
  const p = planSave({ dir: '/m/a', design: 'red', custom: { spineColor: 'red', ink: '#000000', spineOffset: 4 } }, [entry()], null, parseAlbumCustom, '/m/a')
  assert.deepEqual(p.custom, { ink: '#000000' })
  assert.deepEqual(planSave({ dir: '/m/a', design: 'red' }, [entry()], null, parseAlbumCustom, '/m/a').custom, {})
})

test('editState: custom cover wins over the folder cover; default text ignores the override', () => {
  const album = { dir: '/m/a', title: 'T', artist: 'X', year: '2020', cover: 'data:folder', tracks: [] }
  const e = entry({ design: 'red', custom: { text: 'Mine', cover: 'aaaaaaaa.jpg' } })
  assert.deepEqual(editState(e, album, 'data:custom', spineText), { dir: '/m/a', defaultText: 'X - T (2020)', cover: 'data:custom', design: 'red', custom: { text: 'Mine', cover: 'aaaaaaaa.jpg' } })
  assert.equal(editState(e, album, null, spineText).cover, 'data:folder')
})

test('editState: an unreadable folder falls back to its name and no cover', () => {
  assert.deepEqual(editState(entry({ dir: '/m/Some Album' }), null, null, spineText), { dir: '/m/Some Album', defaultText: 'Some Album', cover: null, design: null, custom: {} })
})

test('editBounds: centred over the parent, kept on the work area', () => {
  const area = { x: 0, y: 0, width: 1920, height: 1080 }
  assert.deepEqual(editBounds({ x: 500, y: 300, width: 800, height: 600 }, area), { x: 900 - EDIT_SIZE.width / 2, y: 600 - EDIT_SIZE.height / 2, ...EDIT_SIZE })
  const r = editBounds({ x: -400, y: -300, width: 400, height: 300 }, area)
  assert.deepEqual([r.x, r.y], [0, 0])
})

const boost = { db: 0, set: () => {} }
test('contextMenu: Edit Album… is disabled with no album, and opens the editor when one is loaded', () => {
  const find = (m: ReturnType<typeof contextMenu>) => m.find((i) => i.label === 'Edit Album…')!
  assert.equal(find(contextMenu([], () => {}, { reset: () => {}, fillGaps: () => {} }, boost)).enabled, false)
  let opened = 0
  const item = find(contextMenu([], () => {}, { reset: () => {}, fillGaps: () => {}, editAlbum: () => opened++ }, boost))
  assert.equal(item.enabled, true)
  ;(item.click as () => void)()
  assert.equal(opened, 1)
})

test('rackMenuTemplate: a spine under the pointer adds Edit album…; none without one', () => {
  let edited = 0
  const acts = { setSort: () => {}, remove: () => {}, clear: () => {}, edit: () => edited++ }
  assert.equal(rackMenuTemplate('recent', false, 2, acts).some((i) => i.label === 'Edit album…'), false)
  const item = rackMenuTemplate('recent', true, 2, acts).find((i) => i.label === 'Edit album…')!
  ;(item.click as () => void)()
  assert.equal(edited, 1)
})

test('planSave: a save for an album other than the one being edited is rejected', () => {
  const entries = [entry(), entry({ dir: '/m/b' })]
  assert.throws(() => planSave({ dir: '/m/b', design: 'red', custom: {} }, entries, null, parseAlbumCustom, '/m/a'))
  assert.throws(() => planSave({ dir: '/m/a', design: 'red', custom: {} }, entries, null, parseAlbumCustom, null))
  assert.equal(planSave({ dir: '/m/b', design: 'red', custom: {} }, entries, null, parseAlbumCustom, '/m/b').dir, '/m/b')
})

test('coverTooLarge: either side over 10000 px', () => {
  assert.equal(coverTooLarge({ width: 10000, height: 10000 }), false)
  assert.equal(coverTooLarge({ width: 10001, height: 10 }), true)
  assert.equal(coverTooLarge({ width: 10, height: 10001 }), true)
})
