import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { ALBUM, PLAYLIST, POWER, RACK } from '../src/shared/layout.ts'

// Side windows get the player's exact pixel height, and the player's art fills its canvas edge to edge.
// So each side window's canvas must be just its visible base body (1874 px at 2x), no transparent rows,
// or the side window's body looks shorter than the player.
const BASE_BODY = 937

function pngSize(rel: string): { w: number; h: number } {
  const b = readFileSync(new URL(`../../assets/ui/${rel}`, import.meta.url))
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) } // IHDR width/height
}

for (const [name, L] of [['album', ALBUM], ['playlist', PLAYLIST]] as const) {
  test(`${name} design size is the visible base body`, () => {
    assert.deepEqual(L.WINDOW, { w: BASE_BODY, h: BASE_BODY })
  })
  test(`${name} layer PNGs match the design size`, () => {
    for (const l of L.LAYERS) assert.deepEqual(pngSize(l.file), { w: L.WINDOW.w * L.ASSET_SCALE, h: L.WINDOW.h * L.ASSET_SCALE }, l.file)
  })
}

// The rack is wider than tall; its canvas is its visible frame (3246x1872 at 2x), no transparent margin.
test('rack layer PNGs match the design size', () => {
  assert.deepEqual(RACK.WINDOW, { w: 1623, h: 936 })
  for (const l of RACK.LAYERS) assert.deepEqual(pngSize(l.file), { w: RACK.WINDOW.w * RACK.ASSET_SCALE, h: RACK.WINDOW.h * RACK.ASSET_SCALE }, l.file)
})

// The power deck is tall and narrow; its canvas is its visible frame (902x1868 at 2x), no transparent margin.
test('power deck layer PNGs match the design size', () => {
  assert.deepEqual(POWER.WINDOW, { w: 451, h: 934 })
  for (const l of POWER.LAYERS) assert.deepEqual(pngSize(l.file), { w: POWER.WINDOW.w * POWER.ASSET_SCALE, h: POWER.WINDOW.h * POWER.ASSET_SCALE }, l.file)
})
