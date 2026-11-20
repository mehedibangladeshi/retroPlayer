import { FREE_MIN_COMP, freeMinWindow } from '../src/shared/freeMin.ts'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { clampToLimits, defaultPlayerHeight, displayLimits, fitSize, fitsWorkArea, heightRange, initialHeight, migrateSettings, proportional, LAYOUT_VERSION } from '../src/main/windowSize.ts'

const A = 767 / 616

test('migrateSettings: drops bounds when version missing or old, keeps the rest', () => {
  const w = { x: 1, y: 2, width: 3, height: 4 }
  const s = { lastOpenDir: '/m', window: w, playlistWindow: w, albumWindow: w, rackWindow: w, powerWindow: w }
  assert.deepEqual(migrateSettings(s), { lastOpenDir: '/m', layoutVersion: LAYOUT_VERSION })
  assert.deepEqual(migrateSettings({ ...s, layoutVersion: 1 }), { lastOpenDir: '/m', layoutVersion: LAYOUT_VERSION })
  assert.deepEqual(migrateSettings({ ...s, layoutVersion: 2 }), { lastOpenDir: '/m', layoutVersion: LAYOUT_VERSION })
})

test('migrateSettings: keeps bounds at the current version', () => {
  const w = { x: 1, y: 2, width: 3, height: 4 }
  const s = { lastOpenDir: '/m', window: w, layoutVersion: LAYOUT_VERSION }
  assert.deepEqual(migrateSettings(s), s)
})

// Fixed limits for the pure-geometry tests below: 308..924 tall, widths from the aspect.
const fixedLimits = (aspect: number) => ({ minWidth: Math.round(308 * aspect), minHeight: 308, maxWidth: Math.round(924 * aspect), maxHeight: 924 })
const L = fixedLimits(1)
const rest = { x: 100, y: 100, width: 400, height: 400 }
test('proportional: a width drag sets the height', () => {
  assert.deepEqual(proportional({ x: 100, y: 100, width: 480, height: 400 }, rest, 1, L), { x: 100, y: 100, width: 480, height: 480 })
})
test('proportional: a height drag sets the width', () => {
  assert.deepEqual(proportional({ x: 100, y: 100, width: 400, height: 350 }, rest, 1, L), { x: 100, y: 100, width: 350, height: 350 })
})
test('proportional: a left edge drag keeps the right edge, a top edge drag the bottom edge', () => {
  assert.deepEqual(proportional({ x: 60, y: 100, width: 440, height: 400 }, rest, 1, L), { x: 60, y: 100, width: 440, height: 440 })
  assert.deepEqual(proportional({ x: 100, y: 150, width: 400, height: 350 }, rest, 1, L), { x: 100, y: 150, width: 350, height: 350 })
  // A top-left corner drag that ends off proportion: the bottom-right corner stays put.
  assert.deepEqual(proportional({ x: 40, y: 80, width: 460, height: 420 }, rest, 1, L), { x: 40, y: 40, width: 460, height: 460 })
})
test('proportional: clamped to the limits', () => {
  assert.deepEqual(proportional({ x: 100, y: 100, width: 2000, height: 400 }, rest, 1, L), { x: 100, y: 100, width: 924, height: 924 })
  assert.deepEqual(proportional({ x: 100, y: 100, width: 100, height: 400 }, rest, 1, L), { x: 100, y: 100, width: 308, height: 308 })
})
test('proportional: a size already in proportion is left alone', () => {
  assert.deepEqual(proportional({ x: 5, y: 6, width: 767, height: 616 }, { x: 5, y: 6, width: 384, height: 308 }, 767 / 616, fixedLimits(767 / 616)), { x: 5, y: 6, width: 767, height: 616 })
})
test('proportional: a window manager rounding (within 2 px of the aspect) is left alone', () => {
  const cur = { x: 1, y: 2, width: 480, height: 387 } // openbox's aspect rounding of 480x386
  assert.deepEqual(proportional(cur, { x: 1, y: 2, width: 480, height: 386 }, 767 / 616, fixedLimits(767 / 616)), cur)
})

const area = { width: 1920, height: 1040 }
test('fitSize: a proportional window keeps its aspect, clamped to its limits and the work area', () => {
  const l = fixedLimits(1)
  assert.deepEqual(fitSize({ width: 600, height: 400 }, 1, l, area), { width: 600, height: 600 })
  assert.deepEqual(fitSize({ width: 5000, height: 5000 }, 1, l, area), { width: 924, height: 924 })
  assert.deepEqual(fitSize({ width: 900, height: 900 }, 1, l, { width: 1920, height: 700 }), { width: 700, height: 700 })
})
test('fitSize: a free window (no aspect) keeps its own width and height, each clamped', () => {
  const l = fixedLimits(1623 / 936) // the rack: 534..1602 wide, 308..924 tall
  assert.deepEqual(fitSize({ width: 1200, height: 320 }, null, l, area), { width: 1200, height: 320 })
  assert.deepEqual(fitSize({ width: 100, height: 5000 }, null, l, area), { width: 534, height: 924 })
  assert.deepEqual(fitSize({ width: 1500, height: 900 }, null, l, { width: 1000, height: 600 }), { width: 1000, height: 600 })
})

const GW = 1 + 767 / 616 + 1 + 451 / 934
const GH = 2
const areas: [number, number, number, number, number][] = [
  [1280, 680, 200, 612, 255],
  [1366, 728, 200, 655, 273],
  [1920, 1040, 200, 936, 386],
  [2560, 1400, 200, 1232, 515],
  [3840, 2100, 200, 1232, 773]
]
for (const [width, height, lo, hi, def] of areas) {
  test(`heightRange / defaultPlayerHeight on ${width}x${height}`, () => {
    assert.deepEqual(heightRange({ width, height }, 616), { minHeight: lo, maxHeight: hi })
    assert.equal(defaultPlayerHeight({ width, height }, GW, GH), def)
  })
}

test('heightRange: min floor 200 on a tiny area', () => {
  assert.deepEqual(heightRange({ width: 1024, height: 560 }, 616), { minHeight: 200, maxHeight: 504 })
})

test('displayLimits: free rack window ties min width to min height', () => {
  const l = displayLimits(1623 / 936, { width: 1920, height: 1040 }, 936, true)
  assert.deepEqual(l, { minWidth: 200, minHeight: 200, maxWidth: 1623, maxHeight: 936 })
})

test('displayLimits: a free window with its own minimum uses it for width and height', () => {
  const l = displayLimits(1623 / 936, { width: 1920, height: 1040 }, 936, true, 0, freeMinWindow(FREE_MIN_COMP.rack))
  assert.deepEqual(l, { minWidth: 330, minHeight: 178, maxWidth: 1623, maxHeight: 936 })
})
test('freeMinWindow: the composition at CHROME_SCALE, rounded up', () => {
  assert.deepEqual(freeMinWindow(FREE_MIN_COMP.playlist), { width: 220, height: 218 })
  assert.deepEqual(freeMinWindow(FREE_MIN_COMP.rack), { width: 330, height: 178 })
})

test('displayLimits: aspect window widths follow heights', () => {
  const l = displayLimits(A, { width: 1920, height: 1040 }, 616)
  assert.deepEqual(l, { minWidth: Math.round(200 * A), minHeight: 200, maxWidth: Math.round(936 * A), maxHeight: 936 })
})

test('clampToLimits: an aspect window clamps its height and follows with its width, position kept', () => {
  const l = displayLimits(A, { width: 1280, height: 680 }, 616) // 200..612 tall
  assert.deepEqual(clampToLimits({ x: 5, y: 6, width: 1151, height: 924 }, A, l), { x: 5, y: 6, width: Math.round(612 * A), height: 612 })
  assert.deepEqual(clampToLimits({ x: 5, y: 6, width: 100, height: 80 }, A, l), { x: 5, y: 6, width: Math.round(200 * A), height: 200 })
  const ok = { x: 5, y: 6, width: Math.round(400 * A), height: 400 }
  assert.deepEqual(clampToLimits(ok, A, l), ok)
  // In range but a pixel off the exact aspect (an X11 window manager rounds it, e.g. a 199x414 power deck): left alone,
  // or an unshade would resize it to a size the window manager then rounds again.
  const pd = displayLimits(451 / 934, { width: 1920, height: 1050 }, 934)
  const wm = { x: 750, y: 332, width: 199, height: 414 }
  assert.deepEqual(clampToLimits(wm, 451 / 934, pd), wm)
})

test('clampToLimits: a free window clamps width and height on their own', () => {
  const l = displayLimits(1623 / 936, { width: 1280, height: 680 }, 936, true) // 200..612 tall, 200..1061 wide
  assert.deepEqual(clampToLimits({ x: 1, y: 2, width: 1600, height: 100 }, null, l), { x: 1, y: 2, width: l.maxWidth, height: 200 })
  assert.deepEqual(clampToLimits({ x: 1, y: 2, width: 100, height: 900 }, null, l), { x: 1, y: 2, width: 200, height: 612 })
  assert.deepEqual(clampToLimits({ x: 1, y: 2, width: 700, height: 300 }, null, l), { x: 1, y: 2, width: 700, height: 300 })
})

test('heightRange: the minimum is a flat 200 whatever the work area', () => {
  for (const h of [400, 680, 1040, 2100]) assert.equal(heightRange({ width: 1920, height: h }, 616).minHeight, 200)
})

test('initialHeight: about 60% of the work area, never above the design size, within limits', () => {
  assert.equal(initialHeight(616, 680), 408)
  assert.equal(initialHeight(616, 1040), 616) // 624 would exceed the design size: large screens unchanged
  assert.equal(initialHeight(616, 2100), 616)
  assert.equal(initialHeight(616, 240), 200) // floor
})

test('fitsWorkArea: false when too big or mostly outside the work area', () => {
  const area = { x: 0, y: 0, width: 1280, height: 680 }
  assert.equal(fitsWorkArea({ x: 100, y: 50, width: 767, height: 616 }, area), true)
  assert.equal(fitsWorkArea({ x: 0, y: 0, width: 767, height: 700 }, area), false) // taller
  assert.equal(fitsWorkArea({ x: 0, y: 0, width: 1400, height: 400 }, area), false) // wider
  assert.equal(fitsWorkArea({ x: 1200, y: 0, width: 767, height: 616 }, area), false) // mostly outside
})

// Bar windows: a fixed extra height on top of a body that keeps `aspect`.
test('displayLimits with extraH: w / (h - extraH) = aspect at min and max; extraH 0 is unchanged', () => {
  const a = 937 / 875
  const x = 34.1
  const l = displayLimits(a, { width: 1920, height: 1040 }, 937, false, x)
  assert.ok(Math.abs(l.minWidth / (l.minHeight - x) - a) < 0.01)
  assert.ok(Math.abs(l.maxWidth / (l.maxHeight - x) - a) < 0.01)
  assert.deepEqual(displayLimits(1, { width: 1920, height: 1040 }, 937, false, 0), displayLimits(1, { width: 1920, height: 1040 }, 937))
})
test('fitSize with extraH keeps the body aspect, clamped to limits and the work area', () => {
  const x = 40
  const l = { minWidth: 160, minHeight: 200, maxWidth: 800, maxHeight: 840 }
  assert.deepEqual(fitSize({ width: 400, height: 1 }, 1, l, area, x), { width: 400, height: 440 })
  assert.deepEqual(fitSize({ width: 5000, height: 5000 }, 1, l, area, x), { width: 800, height: 840 })
  assert.deepEqual(fitSize({ width: 900, height: 900 }, 1, l, { width: 1920, height: 700 }, x), { width: 660, height: 700 })
})
test('clampToLimits with extraH rebuilds the width from the body height', () => {
  const l = { minWidth: 160, minHeight: 200, maxWidth: 800, maxHeight: 840 }
  assert.deepEqual(clampToLimits({ x: 1, y: 2, width: 300, height: 2000 }, 1, l, 40), { x: 1, y: 2, width: 800, height: 840 })
})
test('proportional with extraH: a width drag sets height = width / aspect + extraH', () => {
  const l = { minHeight: 200, maxHeight: 840 }
  const r0 = { x: 100, y: 100, width: 400, height: 440 }
  assert.deepEqual(proportional({ x: 100, y: 100, width: 480, height: 440 }, r0, 1, l, 40), { x: 100, y: 100, width: 480, height: 520 })
  assert.deepEqual(proportional({ x: 100, y: 100, width: 400, height: 340 }, r0, 1, l, 40), { x: 100, y: 100, width: 300, height: 340 })
  assert.deepEqual(proportional(r0, r0, 1, l, 40), r0)
})
