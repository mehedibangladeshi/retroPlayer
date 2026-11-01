import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  fitAll,
  follow,
  gripResize,
  isAttached,
  overlaps,
  placeSide,
  snapTo,
  type Rect
} from '../src/main/dock.ts'

const r = (x: number, y: number, width: number, height: number): Rect => ({ x, y, width, height })

test('overlaps: true, false and touching edges', () => {
  assert.equal(overlaps(r(0, 0, 10, 10), r(5, 5, 10, 10)), true)
  assert.equal(overlaps(r(0, 0, 10, 10), r(20, 0, 10, 10)), false)
  assert.equal(overlaps(r(0, 0, 10, 10), r(10, 0, 10, 10)), false)
  assert.equal(overlaps(r(0, 0, 10, 10), r(0, 10, 10, 10)), false)
})

test('placeSide: flush and top-aligned on both sides', () => {
  const p = r(100, 50, 400, 300)
  assert.deepEqual(placeSide(p, { width: 80, height: 200 }, 'right'), r(500, 50, 80, 200))
  assert.deepEqual(placeSide(p, { width: 80, height: 200 }, 'left'), r(20, 50, 80, 200))
})

test('snapTo keeps y and size', () => {
  const p = r(100, 50, 400, 300)
  assert.deepEqual(snapTo(p, r(530, 90, 80, 200), 'right'), r(500, 90, 80, 200))
  assert.deepEqual(snapTo(p, r(0, 90, 80, 200), 'left'), r(20, 90, 80, 200))
})

test('isAttached: tolerance and vertical overlap', () => {
  const p = r(100, 50, 400, 300)
  assert.equal(isAttached(p, r(500, 50, 80, 200), 'right'), true)
  assert.equal(isAttached(p, r(508, 50, 80, 200), 'right'), true)
  assert.equal(isAttached(p, r(520, 50, 80, 200), 'right'), false)
  assert.equal(isAttached(p, r(20, 50, 80, 200), 'left'), true)
  assert.equal(isAttached(p, r(0, 50, 80, 200), 'left'), false)
  assert.equal(isAttached(p, r(500, 350, 80, 200), 'right'), false)
})

test('follow: pure move keeps vertical offset', () => {
  const from = r(100, 50, 400, 300)
  const to = r(150, 80, 400, 300)
  assert.deepEqual(follow(r(500, 70, 80, 200), from, to, 'right'), r(550, 100, 80, 200))
  assert.deepEqual(follow(r(20, 70, 80, 200), from, to, 'left'), r(70, 100, 80, 200))
})

test('follow: resize moves right side to the new right edge, left stays flush', () => {
  const from = r(100, 50, 400, 300)
  const to = r(100, 50, 500, 400)
  assert.deepEqual(follow(r(500, 50, 80, 200), from, to, 'right'), r(600, 50, 80, 200))
  assert.deepEqual(follow(r(20, 50, 80, 200), from, to, 'left'), r(20, 50, 80, 200))
})

test('fitAll: room on both sides leaves everything unchanged', () => {
  const out = fitAll(
    r(200, 50, 400, 300),
    { left: r(120, 50, 80, 200), right: r(600, 50, 80, 200) },
    r(0, 0, 1000, 800)
  )
  assert.deepEqual(out, {
    player: r(200, 50, 400, 300),
    left: r(120, 50, 80, 200),
    right: r(600, 50, 80, 200)
  })
})

test('fitAll: player at left edge with a left side shifts right by the side width', () => {
  const out = fitAll(r(0, 0, 400, 300), { left: r(-80, 0, 80, 200) }, r(0, 0, 1000, 800))
  assert.deepEqual(out.player, r(80, 0, 400, 300))
  assert.deepEqual(out.left, r(0, 0, 80, 200))
  assert.equal(out.right, undefined)
})

test('fitAll: player at right edge with a right side shifts left', () => {
  const out = fitAll(r(600, 0, 400, 300), { right: r(1000, 0, 80, 200) }, r(0, 0, 1000, 800))
  assert.deepEqual(out.player, r(520, 0, 400, 300))
  assert.deepEqual(out.right, r(920, 0, 80, 200))
})

test('fitAll: too-narrow work centres player, sides flush, no overlap', () => {
  const out = fitAll(
    r(0, 0, 400, 300),
    { left: r(0, 0, 100, 200), right: r(0, 0, 100, 200) },
    r(0, 0, 500, 800)
  )
  assert.deepEqual(out.player, r(50, 0, 400, 300))
  assert.deepEqual(out.left, r(-50, 0, 100, 200))
  assert.deepEqual(out.right, r(450, 0, 100, 200))
  assert.equal(overlaps(out.player, out.left!), false)
  assert.equal(overlaps(out.player, out.right!), false)
})

test('fitAll: side without vertical overlap gets the player y', () => {
  const out = fitAll(r(200, 50, 400, 300), { right: r(600, 500, 80, 200) }, r(0, 0, 1000, 800))
  assert.equal(out.right!.y, 50)
})

test('fitAll: player y is clamped into the work area', () => {
  const work = r(0, 0, 1000, 800)
  assert.equal(fitAll(r(200, -40, 400, 300), {}, work).player.y, 0)
  assert.equal(fitAll(r(200, 700, 400, 300), {}, work).player.y, 500)
})

test('gripResize: plain drag, aspect kept, diagonal uses the larger, min clamp', () => {
  const s = r(10, 20, 400, 200)
  assert.deepEqual(gripResize(s, 100, 0, 2, 100, 50), r(10, 20, 500, 250))
  assert.deepEqual(gripResize(s, 0, 100, 2, 100, 50), r(10, 20, 600, 300))
  assert.deepEqual(gripResize(s, 100, 100, 2, 100, 50), r(10, 20, 600, 300))
  assert.deepEqual(gripResize(s, -1000, -1000, 2, 100, 50), r(10, 20, 100, 50))
  assert.deepEqual(gripResize(s, -1000, -1000, 2, 100, 80), r(10, 20, 160, 80))
})
