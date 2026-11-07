import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fitGroup, inferDocks, layout, overlaps, snap, subtree, type Docks, type Rect } from '../src/main/dock.ts'

const r = (x: number, y: number, width: number, height: number): Rect => ({ x, y, width, height })
const P = r(100, 100, 400, 300) // player

test('overlaps: true, false and touching edges', () => {
  assert.equal(overlaps(r(0, 0, 10, 10), r(5, 5, 10, 10)), true)
  assert.equal(overlaps(r(0, 0, 10, 10), r(20, 0, 10, 10)), false)
  assert.equal(overlaps(r(0, 0, 10, 10), r(10, 0, 10, 10)), false)
  assert.equal(overlaps(r(0, 0, 10, 10), r(0, 10, 10, 10)), false)
})

test('snap: each of the four sides, within tolerance', () => {
  assert.deepEqual(snap(r(508, 150, 80, 200), { player: P }), r(500, 150, 80, 200)) // right
  assert.deepEqual(snap(r(15, 150, 80, 200), { player: P }), r(20, 150, 80, 200)) // left
  assert.deepEqual(snap(r(200, 395, 80, 50), { player: P }), r(200, 400, 80, 50)) // bottom
  assert.deepEqual(snap(r(200, 40, 80, 50), { player: P }), r(200, 50, 80, 50)) // top
})

test('snap: aligns the start edge with the window it docks to', () => {
  assert.deepEqual(snap(r(505, 108, 80, 200), { player: P }), r(500, 100, 80, 200))
  assert.deepEqual(snap(r(95, 405, 80, 50), { player: P }), r(100, 400, 80, 50))
})

test('snap: too far, or no overlap on the other axis, leaves the rect alone', () => {
  assert.deepEqual(snap(r(520, 150, 80, 200), { player: P }), r(520, 150, 80, 200))
  assert.deepEqual(snap(r(505, 450, 80, 200), { player: P }), r(505, 450, 80, 200))
})

test('snap: picks the nearest edge among several windows', () => {
  const others = { player: P, album: r(500, 420, 100, 100) }
  // 6 px right of the player, 3 px above the album's top: the album wins.
  assert.deepEqual(snap(r(506, 317, 100, 100), others), r(500, 320, 100, 100))
})

test('inferDocks: windows flush to the root dock to it, chains dock to the window they touch', () => {
  const rects = { player: P, playlist: r(500, 100, 80, 300), album: r(500, 400, 80, 80) }
  const d = inferDocks(rects, ['player'])
  assert.deepEqual(d.playlist, { to: 'player', side: 'right', ratio: 0 })
  assert.deepEqual(d.album, { to: 'playlist', side: 'bottom', ratio: 0 })
})

test('inferDocks: a window that only touches at a corner, or not at all, stays undocked', () => {
  const rects = { player: P, a: r(500, 400, 50, 50), b: r(600, 100, 50, 50) }
  const d = inferDocks(rects, ['player'])
  assert.equal(d.a, undefined)
  assert.equal(d.b, undefined)
})

test('inferDocks: a later root keeps its own group', () => {
  const rects = { player: P, playlist: r(800, 100, 80, 300), album: r(880, 100, 80, 80) }
  const d = inferDocks(rects, ['player', 'playlist', 'album'])
  assert.equal(d.playlist, undefined)
  assert.deepEqual(d.album, { to: 'playlist', side: 'right', ratio: 0 })
})

test('inferDocks: ratio records the offset along the shared edge', () => {
  const d = inferDocks({ player: P, a: r(200, 400, 80, 80) }, ['player'])
  assert.deepEqual(d.a, { to: 'player', side: 'bottom', ratio: 0.25 })
})

test('layout: docked windows follow a moved player, in chains, on every side', () => {
  const docks: Docks = {
    right: { to: 'player', side: 'right', ratio: 0 },
    left: { to: 'player', side: 'left', ratio: 0 },
    top: { to: 'player', side: 'top', ratio: 0.5 },
    below: { to: 'right', side: 'bottom', ratio: 0 }
  }
  const rects = {
    player: r(150, 130, 400, 300), // moved +50, +30
    right: r(500, 100, 80, 300),
    left: r(20, 100, 80, 300),
    top: r(300, 50, 60, 50),
    below: r(500, 400, 80, 80),
    loose: r(900, 900, 10, 10)
  }
  const out = layout(rects, docks)
  assert.deepEqual(out.right, r(550, 130, 80, 300))
  assert.deepEqual(out.left, r(70, 130, 80, 300))
  assert.deepEqual(out.top, r(350, 80, 60, 50))
  assert.deepEqual(out.below, r(550, 430, 80, 80))
  assert.deepEqual(out.loose, r(900, 900, 10, 10))
  assert.deepEqual(out.player, rects.player)
})

test('layout: a resized anchor keeps the dock flush and scales the offset', () => {
  const out = layout({ player: r(100, 100, 800, 600), a: r(200, 400, 80, 80) }, { a: { to: 'player', side: 'bottom', ratio: 0.25 } })
  assert.deepEqual(out.a, r(300, 700, 80, 80))
})

test('layout: a dock to a missing (hidden) window leaves the window where it is', () => {
  const out = layout({ player: P, a: r(1, 2, 3, 4) }, { a: { to: 'gone', side: 'left', ratio: 0 } })
  assert.deepEqual(out.a, r(1, 2, 3, 4))
})

test('subtree: a window and everything docked to it, directly or through others', () => {
  const docks: Docks = { a: { to: 'player', side: 'left', ratio: 0 }, b: { to: 'a', side: 'top', ratio: 0 }, c: { to: 'player', side: 'right', ratio: 0 } }
  assert.deepEqual([...subtree(docks, 'a')].sort(), ['a', 'b'])
  assert.deepEqual([...subtree(docks, 'player')].sort(), ['a', 'b', 'c', 'player'])
})

test('fitGroup: a group already inside the work area does not move', () => {
  assert.deepEqual(fitGroup([P, r(20, 100, 80, 300)], r(0, 0, 1000, 800)), { dx: 0, dy: 0 })
})

test('fitGroup: smallest shift that brings the group inside', () => {
  const work = r(0, 0, 1000, 800)
  assert.deepEqual(fitGroup([r(0, 0, 400, 300), r(-80, 0, 80, 300)], work), { dx: 80, dy: 0 })
  assert.deepEqual(fitGroup([r(600, 500, 400, 300), r(600, 800, 400, 50)], work), { dx: 0, dy: -50 })
})

test('fitGroup: a group too big for the work area clamps the player in, start edge wins', () => {
  const out = fitGroup([r(0, -40, 400, 300), r(-100, 0, 100, 300), r(400, 0, 200, 300)], r(0, 0, 500, 800))
  assert.deepEqual(out, { dx: 0, dy: 40 })
})
