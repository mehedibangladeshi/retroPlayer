import { test } from 'node:test'
import assert from 'node:assert/strict'
import { hexRgb, inkFor, meanRgb, nameColor, parseRack, record, remove, reorder, setSort, spineCrop, spineText, view, type RackFile } from '../src/main/rack.ts'
import { SPINE_ASPECT, type Spine } from '../src/shared/rack.ts'

const sp = (dir: string, text = dir): Spine => ({ dir, text, image: null, bg: '#102030', ink: '#ffffff' })
const file = (...dirs: string[]): RackFile => ({ sort: 'recent', entries: dirs.map((d, i) => ({ ...sp(d), lastUsed: i })) })
const dirs = (f: RackFile): string[] => f.entries.map((e) => e.dir)

test('parseRack: garbage gives an empty recent rack', () => {
  for (const raw of [null, undefined, 5, 'x', [], {}, { sort: 'custom', entries: 3 }]) {
    const f = parseRack(raw)
    assert.equal(f.entries.length, 0)
    assert.equal(f.sort, 'recent')
  }
})

test('parseRack: keeps good entries, drops bad ones and duplicates, bad sort -> recent', () => {
  const good = { ...sp('/a'), lastUsed: 5 }
  const f = parseRack({
    sort: 'nope',
    entries: [good, { ...good, text: 'dup' }, { ...good, dir: '/b', ink: 'red' }, { ...good, dir: '/c', bg: 'blue' }, { ...good, dir: '/d', lastUsed: 'x' }, { ...good, dir: '/e', image: 7 }, null, { ...good, dir: '/f', image: 'data:image/jpeg;base64,AA' }]
  })
  assert.equal(f.sort, 'recent')
  assert.deepEqual(dirs(f), ['/a', '/f'])
  assert.equal(f.entries[0].text, '/a')
  assert.equal(f.entries[1].image, 'data:image/jpeg;base64,AA')
})

test('spineText: drops missing parts', () => {
  const d = '/m/Some Album'
  assert.equal(spineText({ dir: d, title: 'Al', artist: 'Ar', year: '1999' }), 'Ar - Al (1999)')
  assert.equal(spineText({ dir: d, title: 'Al', artist: null, year: '1999' }), 'Al (1999)')
  assert.equal(spineText({ dir: d, title: 'Al', artist: 'Ar', year: null }), 'Ar - Al')
  assert.equal(spineText({ dir: d, title: 'Al', artist: ' ', year: '' }), 'Al')
})

test('spineText: blank title falls back to the folder name (either separator)', () => {
  assert.equal(spineText({ dir: '/m/Some Album', title: null, artist: null, year: null }), 'Some Album')
  assert.equal(spineText({ dir: 'C:\\Music\\Win Album\\', title: '  ', artist: 'Ar', year: null }), 'Ar - Win Album')
})

test('nameColor: stable, valid hex, differs by input', () => {
  assert.match(nameColor('abc'), /^#[0-9a-f]{6}$/)
  assert.equal(nameColor('abc'), nameColor('abc'))
  assert.notEqual(nameColor('abc'), nameColor('abd'))
})

test('meanRgb: BGRA bytes to RGB means; empty is black', () => {
  assert.deepEqual(meanRgb(new Uint8Array([10, 20, 30, 255, 30, 40, 50, 255])), [40, 30, 20])
  assert.deepEqual(meanRgb(new Uint8Array(0)), [0, 0, 0])
})

test('inkFor: white on dark, black on light, picks the higher contrast on mid', () => {
  assert.equal(inkFor([0, 0, 0]), '#ffffff')
  assert.equal(inkFor([255, 255, 255]), '#000000')
  assert.equal(inkFor([255, 255, 0]), '#000000')
  assert.equal(inkFor([0, 0, 128]), '#ffffff')
  assert.equal(inkFor([119, 119, 119]), '#000000')
  assert.equal(inkFor([118, 118, 118]), '#000000')
})

test('hexRgb parses #rrggbb', () => {
  assert.deepEqual(hexRgb('#0a14ff'), [10, 20, 255])
})

function checkCrop(w: number, h: number): { x: number; y: number; width: number; height: number } {
  const c = spineCrop(w, h)
  for (const n of [c.x, c.y, c.width, c.height]) assert.ok(Number.isInteger(n))
  assert.ok(c.x >= 0 && c.y >= 0 && c.width >= 1 && c.height >= 1)
  assert.ok(c.x + c.width <= w && c.y + c.height <= h)
  return c
}

test('spineCrop: square cover uses full height, centred strip', () => {
  const c = checkCrop(1000, 1000)
  assert.equal(c.height, 1000)
  assert.equal(c.y, 0)
  assert.ok(Math.abs(c.width / c.height - SPINE_ASPECT) < 0.002)
  assert.ok(Math.abs(c.x + c.width / 2 - 500) <= 1)
})

test('spineCrop: wide image uses full height', () => {
  const c = checkCrop(3000, 1000)
  assert.equal(c.height, 1000)
  assert.ok(Math.abs(c.x + c.width / 2 - 1500) <= 1)
})

test('spineCrop: too-narrow image uses full width and a centred band', () => {
  const c = checkCrop(100, 2000)
  assert.equal(c.x, 0)
  assert.equal(c.width, 100)
  assert.ok(Math.abs(c.height - 100 / SPINE_ASPECT) <= 1)
  assert.ok(Math.abs(c.y + c.height / 2 - 1000) <= 1)
})

test('spineCrop: tiny image stays valid', () => {
  checkCrop(1, 1)
  checkCrop(3, 500)
})

test('record: new albums append, existing keep position and refresh visuals and lastUsed', () => {
  let f = record(file(), sp('/a'), 10)
  f = record(f, sp('/b'), 20)
  f = record(f, { ...sp('/a', 'new'), bg: '#ffffff' }, 30)
  assert.deepEqual(dirs(f), ['/a', '/b'])
  assert.equal(f.entries[0].text, 'new')
  assert.equal(f.entries[0].bg, '#ffffff')
  assert.equal(f.entries[0].lastUsed, 30)
  assert.equal(f.entries.length, 2)
})

test('remove: drops the dir, unknown dir is a no-op', () => {
  const f = file('/a', '/b')
  assert.deepEqual(dirs(remove(f, '/a')), ['/b'])
  assert.deepEqual(dirs(remove(f, '/zz')), ['/a', '/b'])
})

test('reorder: listed first, unknown ignored, unlisted keep relative order after', () => {
  const f = file('/a', '/b', '/c', '/d')
  assert.deepEqual(dirs(reorder(f, ['/c', '/x', '/a'])), ['/c', '/a', '/b', '/d'])
  assert.deepEqual(dirs(reorder(f, ['/c', '/c'])), ['/c', '/a', '/b', '/d'])
})

test('setSort changes only the mode; custom order survives recent -> custom', () => {
  let f = reorder(file('/a', '/b', '/c'), ['/c', '/b', '/a'])
  f = setSort(f, 'recent')
  assert.equal(f.sort, 'recent')
  f = setSort(f, 'custom')
  assert.deepEqual(dirs(f), ['/c', '/b', '/a'])
})

test('view: recent sorts by lastUsed desc, custom keeps array order, lastUsed stripped', () => {
  const f = file('/a', '/b', '/c')
  const r = view(f)
  assert.deepEqual(r.spines.map((s) => s.dir), ['/c', '/b', '/a'])
  assert.ok(!('lastUsed' in r.spines[0]))
  assert.deepEqual(view(setSort(f, 'custom')).spines.map((s) => s.dir), ['/a', '/b', '/c'])
})

test('functions do not mutate their input', () => {
  const f = file('/a', '/b')
  const snap = JSON.stringify(f)
  record(f, sp('/c'), 9); remove(f, '/a'); reorder(f, ['/b']); setSort(f, 'custom'); view(f)
  assert.equal(JSON.stringify(f), snap)
})
