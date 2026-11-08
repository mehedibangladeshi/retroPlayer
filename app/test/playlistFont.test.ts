import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { PLAYLIST } from '../src/shared/layout.ts'

// The playlist uses the bundled Montserrat variable font (SIL OFL) for the album heading and song rows.
const viewSrc = readFileSync(new URL('../src/renderer/src/views/PlaylistView.tsx', import.meta.url), 'utf8')
// Drop comments so explanatory text cannot trip the source checks.
const code = viewSrc.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')

test('playlist font family is Montserrat', () => {
  assert.equal(PLAYLIST.FONT_FAMILY, 'Montserrat')
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

test('playlist font stack falls back to sans-serif', () => {
  assert.equal(code.includes('sans-serif'), true)
  assert.equal(code.includes('monospace'), false)
})

test('playlist view imports the bundled Montserrat variable font', () => {
  assert.equal(code.includes('Montserrat-VariableFont_wght.ttf'), true)
  assert.equal(code.includes('AnotherTypewriter'), false)
})

test('bundled playlist font files are Montserrat and its licence only', () => {
  const dir = new URL('../../assets/ui/playlist/fonts/', import.meta.url)
  assert.equal(existsSync(new URL('Montserrat-VariableFont_wght.ttf', dir)), true)
  assert.equal(existsSync(new URL('Montserrat-OFL.txt', dir)), true)
  assert.equal(existsSync(new URL('AnotherTypewriter.ttf', dir)), false)
})
