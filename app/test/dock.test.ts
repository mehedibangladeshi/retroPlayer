import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fillGaps, fitGroup, inferDocks, layout, overlaps, snap, snapResize, subtree, type Docks, type Limits, type Rect } from '../src/main/dock.ts'

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

test('snap: aligns the end edge when it is closer than the start edge', () => {
  // Right of the player, bottom 5 px above the player's bottom (400), top 25 px off: bottoms align.
  assert.deepEqual(snap(r(505, 125, 80, 270), { player: P }), r(500, 130, 80, 270))
  // Below the player, right edge 4 px short of the player's right (500): rights align.
  assert.deepEqual(snap(r(196, 405, 300, 50), { player: P }), r(200, 400, 300, 50))
})

test('snap: the start edge still wins when it is closer', () => {
  // top 3 px off the player's top, bottom 10 px off its bottom.
  assert.deepEqual(snap(r(505, 103, 80, 287), { player: P }), r(500, 100, 80, 287))
})

const L: Limits = { minWidth: 50, minHeight: 50, maxWidth: 2000, maxHeight: 2000 }

test('snapResize: a free window right edge snaps to a neighbour right edge, height untouched', () => {
  const from = r(100, 400, 300, 200) // below the player (100..500)
  const cur = r(100, 400, 392, 210) // right edge 8 px short of 500, bottom moved too but nothing near it
  assert.deepEqual(snapResize(cur, from, [P], null, L), r(100, 400, 400, 210))
})

test('snapResize: a free window top edge snaps to a neighbour bottom edge', () => {
  const from = r(100, 420, 300, 200)
  const cur = r(100, 406, 300, 214) // top dragged up to 406, 6 px below the player's bottom (400)
  assert.deepEqual(snapResize(cur, from, [P], null, L), r(100, 400, 300, 220))
})

test('snapResize: no edge within 12 px leaves the rect unchanged', () => {
  const from = r(100, 420, 300, 200)
  const cur = r(100, 420, 370, 200) // right at 470, 30 px from 500
  assert.deepEqual(snapResize(cur, from, [P], null, L), cur)
})

test('snapResize: an edge only snaps to rects whose span overlaps or touches', () => {
  const from = r(100, 700, 300, 200) // far below the player, no shared span
  const cur = r(100, 700, 395, 200)
  assert.deepEqual(snapResize(cur, from, [P], null, L), cur)
})

test('snapResize: an aspect window led by width snaps its width and derives its height', () => {
  const from = r(100, 400, 300, 150) // aspect 2
  const cur = r(100, 400, 394, 160) // width changed most, right 6 px short of 500
  assert.deepEqual(snapResize(cur, from, [P], 2, L), r(100, 400, 400, 200))
})

test('snapResize: an aspect window dragged by its left edge keeps its right and bottom edges', () => {
  const from = r(600, 200, 200, 100) // aspect 2, right at 800, bottom at 300
  const cur = r(505, 180, 295, 120) // left dragged to 505 (5 px off the player's right) and top moved
  assert.deepEqual(snapResize(cur, from, [P], 2, L), r(500, 150, 300, 150))
})

test('snapResize: the result is clamped to the limits, keeping the unmoved edge', () => {
  const lim: Limits = { minWidth: 50, minHeight: 50, maxWidth: 380, maxHeight: 2000 }
  const from = r(100, 400, 300, 200)
  const cur = r(100, 400, 392, 200)
  assert.deepEqual(snapResize(cur, from, [P], null, lim), r(100, 400, 380, 200))
  const curL = r(15, 400, 385, 200) // left dragged 5 px right of a neighbour's right edge at 10: 390 wide, clamped to 380
  assert.deepEqual(snapResize(curL, r(100, 400, 300, 200), [r(-100, 300, 110, 300)], null, lim), r(20, 400, 380, 200))
})

test('fillGaps: the playlist grows right and down to complete an L-shaped group', () => {
  const rects = {
    player: r(0, 0, 400, 300),
    album: r(0, 300, 400, 200),
    playlist: r(400, 0, 200, 300) // the gap is 400..600 x 300..500
  }
  const out = fillGaps(rects, ['playlist'], { playlist: L })
  assert.deepEqual(out, { playlist: r(400, 0, 200, 500) })
})

test('fillGaps: a free window stops at an aspect window in its way', () => {
  const rects = {
    player: r(0, 0, 400, 300),
    playlist: r(0, 300, 200, 200),
    album: r(300, 300, 100, 200)
  }
  // Right: blocked by the album at 300. Down/left/up: already at the bbox or blocked by the player.
  const out = fillGaps(rects, ['playlist'], { playlist: L })
  assert.deepEqual(out, { playlist: r(0, 300, 300, 200) })
})

test('fillGaps: maxWidth is respected', () => {
  const rects = { player: r(0, 0, 400, 300), playlist: r(0, 300, 200, 200) }
  const out = fillGaps(rects, ['playlist'], { playlist: { ...L, maxWidth: 250 } })
  assert.deepEqual(out, { playlist: r(0, 300, 250, 200) })
})

test('fillGaps: no free windows gives {}', () => {
  assert.deepEqual(fillGaps({ player: P, album: r(500, 100, 100, 100) }, [], {}), {})
})

test('fillGaps: only changed free windows are returned', () => {
  const rects = {
    player: r(0, 0, 400, 300),
    rack: r(400, 0, 200, 300), // already fills its column
    playlist: r(0, 300, 500, 200) // gap to the right up to 600; it also blocks the rack from growing down
  }
  const out = fillGaps(rects, ['rack', 'playlist'], { rack: L, playlist: L })
  assert.deepEqual(out, { playlist: r(0, 300, 600, 200) })
})

test('snapResize: an aspect window clamped by maxHeight gets an integer size within its limits', () => {
  const aspect = 767 / 616
  const lim: Limits = { minWidth: 50, minHeight: 50, maxWidth: 2000, maxHeight: 300 } // maxHeight * aspect = 373.5
  const from = r(100, 400, 300, 241)
  const cur = r(100, 400, 394, 250) // right snaps to 500: 400 wide, over the limit
  const out = snapResize(cur, from, [P], aspect, lim)
  assert.ok(Number.isInteger(out.width) && Number.isInteger(out.height))
  assert.ok(out.height <= lim.maxHeight && out.width <= lim.maxWidth)
  assert.deepEqual(out, r(100, 400, 373, 300))
})

test('fillGaps: grows left up to the nearest window', () => {
  const rects = { player: r(0, 0, 400, 300), album: r(0, 300, 100, 200), playlist: r(200, 300, 200, 200) }
  assert.deepEqual(fillGaps(rects, ['playlist'], { playlist: L }), { playlist: r(100, 300, 300, 200) })
})

test('fillGaps: grows up to the nearest window', () => {
  const rects = { player: r(0, 0, 200, 300), album: r(200, 0, 200, 100), playlist: r(200, 200, 200, 300) }
  assert.deepEqual(fillGaps(rects, ['playlist'], { playlist: L }), { playlist: r(200, 100, 200, 400) })
})

test('fillGaps: maxHeight is respected', () => {
  const rects = { player: r(0, 0, 400, 300), album: r(0, 300, 400, 200), playlist: r(400, 0, 200, 300) }
  assert.deepEqual(fillGaps(rects, ['playlist'], { playlist: { ...L, maxHeight: 400 } }), { playlist: r(400, 0, 200, 400) })
})

test('fillGaps: a window that already overlaps the free window blocks its growth', () => {
  const rects = { player: r(0, 0, 400, 300), playlist: r(300, 200, 100, 100), rack: r(0, 300, 600, 200) }
  assert.deepEqual(fillGaps(rects, ['playlist'], { playlist: L }), {})
})
