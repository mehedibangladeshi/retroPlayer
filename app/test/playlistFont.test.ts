import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { PLAYLIST } from '../src/shared/layout.ts'

// The playlist uses the bundled "Another Typewriter" face. It has no '-', '…' or
// accented glyphs, so artist and title are joined with an en dash and the stack
// falls back to monospace.
const viewSrc = readFileSync(new URL('../src/renderer/src/views/PlaylistView.tsx', import.meta.url), 'utf8')
// Drop comments so explanatory text cannot trip the source checks.
const code = viewSrc.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')

test('playlist font family is Another Typewriter', () => {
  assert.equal(PLAYLIST.FONT_FAMILY, 'Another Typewriter')
})

test('playlist heading and row sizes match the rendered preview', () => {
  assert.equal(PLAYLIST.HEADING.fontSize, 32)
  assert.equal(PLAYLIST.ROW.fontSize, 28)
  assert.equal(PLAYLIST.ROW.pitch, 36)
})

test('playlist joins artist and title with an en dash, not a hyphen', () => {
  assert.equal(code.includes("' - '"), false)
  assert.equal(code.includes('` - `'), false)
  assert.equal(code.includes('${artist} - '), false)
  assert.equal(code.includes('–'), true)
})

test('playlist font stack falls back to monospace', () => {
  assert.equal(code.includes('monospace'), true)
  assert.equal(code.includes('sans-serif'), false)
})

test('playlist view imports the bundled Another Typewriter font', () => {
  assert.equal(code.includes('AnotherTypewriter.ttf'), true)
  assert.equal(code.includes('SueEllenFrancisco'), false)
})

test('bundled playlist font files are Another Typewriter only', () => {
  const dir = new URL('../../assets/ui/playlist/fonts/', import.meta.url)
  assert.equal(existsSync(new URL('AnotherTypewriter.ttf', dir)), true)
  assert.equal(existsSync(new URL('SueEllenFrancisco-Regular.ttf', dir)), false)
})
