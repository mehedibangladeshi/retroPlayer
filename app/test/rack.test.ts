import { test } from 'node:test'
import assert from 'node:assert/strict'
import { hexRgb, inkFor, meanRgb, nameColor, foldResume, parseRack, rackPlayCommands, record, remove, reorder, resumePlan, setSort, spineCrop, spineText, view, type RackFile } from '../src/main/rack.ts'
import { restoreStep } from '../src/main/session.ts'
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

test('view: nowPlaying is the playing dir when it is in the rack, else null', () => {
  const f = file('/a', '/b')
  assert.equal(view(f, '/a').nowPlaying, '/a')
  assert.equal(view(f, '/x').nowPlaying, null)
  assert.equal(view(f, null).nowPlaying, null)
  assert.equal(view(f).nowPlaying, null)
})

// ---- per-album resume point ----
const rs = { index: 2, path: '/a/3.flac', positionMs: 5000 }
const alb = { dir: '/a', tracks: [{ path: '/a/1.flac' }, { path: '/a/2.flac' }, { path: '/a/3.flac' }] }
const st = (path: string, positionMs: number): never => ({ type: 'state', positionMs, trackInfo: { path } }) as never
const withResume = (r?: unknown): RackFile => ({ sort: 'recent', entries: [{ ...sp('/a'), lastUsed: 1, ...(r === undefined ? {} : { resume: r }) } as never] })

test('parseRack: keeps a valid resume, drops a malformed one but keeps the entry', () => {
  assert.deepEqual(parseRack(withResume(rs)).entries[0].resume, rs)
  for (const bad of [{ ...rs, index: -1 }, { ...rs, index: 1.5 }, { ...rs, positionMs: -1 }, { ...rs, positionMs: NaN }, { ...rs, path: '' }, 'x', null]) {
    const e = parseRack(withResume(bad)).entries
    assert.equal(e.length, 1)
    assert.equal(e[0].resume, undefined)
  }
})

test('view never exposes resume', () => {
  assert.ok(!('resume' in view(withResume(rs)).spines[0]))
})

test('record keeps an existing resume', () => {
  assert.deepEqual(record(withResume(rs), sp('/a'), 9).entries[0].resume, rs)
})

test('resumePlan: none or file gone -> null; reordered album re-derives the index', () => {
  assert.equal(resumePlan(undefined, ['/a/3.flac']), null)
  assert.equal(resumePlan(rs, ['/a/1.flac']), null)
  assert.deepEqual(resumePlan(rs, ['/a/3.flac', '/a/1.flac']), { index: 0, positionMs: 5000 })
})

test('foldResume: state sets track and time, position updates time, stop resets to 0 on the same track', () => {
  let f = foldResume(withResume(), alb, st('/a/2.flac', 0))
  assert.deepEqual(f.entries[0].resume, { index: 1, path: '/a/2.flac', positionMs: 0 })
  f = foldResume(f, alb, { type: 'position', positionMs: 7000 } as never)
  assert.equal(f.entries[0].resume?.positionMs, 7000)
  f = foldResume(f, alb, st('/a/2.flac', 7000)) // pause keeps time
  assert.equal(f.entries[0].resume?.positionMs, 7000)
  f = foldResume(f, alb, st('/a/2.flac', 0)) // stop
  assert.deepEqual(f.entries[0].resume, { index: 1, path: '/a/2.flac', positionMs: 0 })
})

test('foldResume: single file and no entry leave the rack untouched', () => {
  const f = withResume(rs)
  assert.equal(foldResume(f, null, st('/x.flac', 1)), f)
  assert.equal(foldResume(f, { dir: '/zzz', tracks: [{ path: '/x.flac' }] }, st('/x.flac', 1)), f)
})

test('rackPlayCommands: with a plan loads paused, seeks if > 0, then plays; without, a plain loadAlbum', () => {
  assert.deepEqual(rackPlayCommands('/a', { index: 2, positionMs: 5000 }).map((c) => c.type), ['loadAlbum', 'seek', 'play'])
  assert.deepEqual(rackPlayCommands('/a', { index: 1, positionMs: 0 }).map((c) => c.type), ['loadAlbum', 'play'])
  assert.deepEqual(rackPlayCommands('/a', null), [{ v: 1, type: 'loadAlbum', path: '/a' }])
})

test('rack:play with a plan: load and seek states are skipped by restoreLeft, the seek state lands the time, play keeps it', () => {
  let f = withResume(rs)
  let left = 2 // rackPlayCommands(...).length - 1 for load, seek, play
  for (const evt of [st('/a/3.flac', 0), st('/a/3.flac', 5000), st('/a/3.flac', 5000)]) {
    left = restoreStep(left, evt)
    if (left === 0) f = foldResume(f, alb, evt)
    if (evt === undefined) break
  }
  assert.equal(left, 0)
  assert.equal(f.entries[0].resume?.positionMs, 5000)
})
