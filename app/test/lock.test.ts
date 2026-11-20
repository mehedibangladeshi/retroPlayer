import { test } from 'node:test'
import assert from 'node:assert/strict'
import { canLock, grabOffsets, lockedResize, placeGroup, restoreLocked } from '../src/main/lock.ts'
import { groupResize, layout, type Docks, type Rect, type SizeRule } from '../src/main/dock.ts'

const r = (x: number, y: number, width: number, height: number): Rect => ({ x, y, width, height })
const docks: Docks = {
  playlist: { to: 'player', side: 'right', ratio: 0 },
  power: { to: 'playlist', side: 'right', ratio: 0 }
}

test('canLock: every visible window must be in the player group', () => {
  assert.equal(canLock(['player', 'playlist', 'power'], docks), true)
  assert.equal(canLock(['player'], {}), true)
  assert.equal(canLock(['player', 'album'], docks), false) // album has no dock
  assert.equal(canLock(['player', 'album'], { ...docks, album: { to: 'rack', side: 'left', ratio: 0 } }), false) // docked to a loose window
})

test('restoreLocked: stays locked only if it was saved locked and still can lock', () => {
  assert.equal(restoreLocked(true, ['player', 'playlist'], docks), true)
  assert.equal(restoreLocked(true, ['player', 'album'], docks), false)
  assert.equal(restoreLocked(false, ['player'], docks), false)
  assert.equal(restoreLocked(undefined, ['player'], docks), false)
})

test('grabOffsets + placeGroup: dragging one window moves all by the same delta, gaps exact', () => {
  const rects = { player: r(100, 100, 400, 300), playlist: r(502, 100, 200, 300), power: r(704, 100, 100, 300) }
  const off = grabOffsets(rects, 'playlist', rects.playlist)
  const out = placeGroup(rects, off, 'playlist', r(520, 140, 200, 300)) // playlist dragged by (18, 40)
  assert.deepEqual(out.player, r(118, 140, 400, 300))
  assert.deepEqual(out.playlist, r(520, 140, 200, 300))
  assert.deepEqual(out.power, r(722, 140, 100, 300))
})

test('lockedResize: scales the group by one factor, keeps gaps and a shaded window\'s size', () => {
  const BIG = { minWidth: 1, minHeight: 1, maxWidth: 1e5, maxHeight: 1e5 }
  const rects = { player: r(100, 100, 400, 300), playlist: r(502, 100, 200, 300), power: r(704, 100, 100, 40) }
  const rules: Record<string, SizeRule> = {
    player: { aspect: 400 / 300, extraH: 0, limits: BIG },
    playlist: { aspect: null, extraH: 0, limits: BIG },
    power: { aspect: null, extraH: 0, limits: BIG }
  }
  const out = lockedResize({ groupResize, layout }, rects, docks, rules, ['power'], 'player', r(100, 100, 800, 600))
  assert.deepEqual([out.player.width, out.player.height], [800, 600])
  assert.deepEqual([out.playlist.width, out.playlist.height], [400, 600])
  assert.equal(out.playlist.x, out.player.x + out.player.width + 2)
  assert.deepEqual([out.power.width, out.power.height], [100, 40]) // shaded: size kept
  assert.equal(out.power.x, out.playlist.x + out.playlist.width + 2)
})

import { isJump, jumpConfirmed } from '../src/main/lock.ts'
test('isJump: a big sudden move (an openbox (0,0) report) is a jump, a normal drag step is not', () => {
  assert.equal(isJump(r(500, 400, 100, 100), r(0, 0, 100, 100)), true)
  assert.equal(isJump(r(500, 400, 100, 100), r(530, 380, 100, 100)), false)
  assert.equal(isJump(r(500, 400, 100, 100), r(500, 400, 100, 100)), false)
})

test('lockedResize at factor 1 shrinks the group uniformly when a limit got tighter (display change)', () => {
  const BIG = { minWidth: 1, minHeight: 1, maxWidth: 1e5, maxHeight: 1e5 }
  const rects = { player: r(100, 100, 400, 300), playlist: r(502, 100, 200, 300) }
  const rules: Record<string, SizeRule> = {
    player: { aspect: 400 / 300, extraH: 0, limits: BIG },
    playlist: { aspect: null, extraH: 0, limits: { ...BIG, maxHeight: 150 } }
  }
  const out = lockedResize({ groupResize, layout }, rects, docks, rules, [], 'player', rects.player)
  assert.ok(out.playlist.height <= 150)
  assert.ok(Math.abs(out.player.width / 400 - out.playlist.width / 200) < 0.02) // one factor
  assert.equal(out.playlist.x, out.player.x + out.player.width + 2)
})

test('jumpConfirmed: a second report near the first is a fast drag; a return to the old spot is not', () => {
  assert.equal(jumpConfirmed(r(700, 500, 10, 10), r(850, 520, 10, 10)), true)
  assert.equal(jumpConfirmed(r(0, 0, 10, 10), r(500, 400, 10, 10)), false)
})

test('lockedResize: a window docked to a hidden one is placed against its nearest visible ancestor, gap exact', () => {
  const BIG = { minWidth: 1, minHeight: 1, maxWidth: 1e5, maxHeight: 1e5 }
  const rects = { player: r(100, 100, 400, 300), power: r(704, 100, 100, 300) } // playlist (between) is hidden
  const rules: Record<string, SizeRule> = {
    player: { aspect: 400 / 300, extraH: 0, limits: BIG },
    power: { aspect: null, extraH: 0, limits: BIG }
  }
  const out = lockedResize({ groupResize, layout }, rects, docks, rules, [], 'player', r(100, 100, 800, 600))
  assert.equal(out.power.x, out.player.x + out.player.width + 2)
  assert.equal(out.power.height, 600)
})
