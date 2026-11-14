import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { PLAYLIST, RACK_TITLE } from '../src/shared/layout.ts'

// Every window's code-drawn text uses the bundled Liberation Sans (SIL OFL), except the playlist, which keeps its own
// font. The brand texts "SUPER LX- RETRO" and "HIGH QUALITY AUDIO" stay baked into the artwork (no Hillside font file).
const src = new URL('../src/renderer/src/', import.meta.url)
const read = (p: string): string => readFileSync(new URL(p, src), 'utf8').replace(/(^|\s)\/\*[\s\S]*?\*\//g, '$1')

test('Liberation Sans and its licence are bundled', () => {
  const dir = new URL('../../assets/ui/fonts/', import.meta.url)
  assert.equal(existsSync(new URL('LiberationSans-Regular.ttf', dir)), true)
  assert.equal(existsSync(new URL('LiberationSans-OFL.txt', dir)), true)
})

test('the app stylesheet loads Liberation Sans and sets it on the page, and main imports it', () => {
  const css = read('fonts.css')
  assert.match(css, /@font-face\s*\{[^}]*font-family:\s*'Liberation Sans'[^}]*LiberationSans-Regular\.ttf/)
  assert.match(css, /body[^{]*\{[^}]*font-family:\s*'Liberation Sans',\s*sans-serif/)
  assert.match(read('main.tsx'), /import '\.\/fonts\.css'/)
})

test('no view but the playlist picks another font', () => {
  const views = readdirSync(new URL('views/', src), { recursive: true }) as string[]
  for (const f of views.filter((f) => /\.(css|tsx)$/.test(f) && !f.startsWith('PlaylistView'))) {
    const code = read(`views/${f}`)
    assert.doesNotMatch(code, /font-family:\s*(?!inherit)|fontFamily/, f)
    assert.doesNotMatch(code, /font:\s*(?!inherit)[^;]*(serif|system-ui|monospace)/, f)
  }
})

test('Hillside Sans is not bundled or named in the app', () => {
  assert.equal(existsSync(new URL('../../assets/ui/fonts/HillsideSans.otf', import.meta.url)), false)
  assert.equal(existsSync(new URL('../../assets/ui/fonts/HillsideSans-ReadMe.txt', import.meta.url)), false)
  const views = (readdirSync(new URL('views/', src), { recursive: true }) as string[]).filter((f) => /\.(css|tsx?)$/.test(f))
  for (const f of ['fonts.css', ...views.map((v) => `views/${v}`)]) assert.doesNotMatch(read(f), /hillside|BRAND\b|R\.TITLE/i, f)
  assert.doesNotMatch(readFileSync(new URL('../src/shared/layout.ts', import.meta.url), 'utf8'), /hillside|export const BRAND/i)
})

test('the brand texts are the original baked artwork', () => {
  const sha = (p: string): string => createHash('sha256').update(readFileSync(new URL(`../../assets/ui/${p}`, import.meta.url))).digest('hex')
  assert.equal(sha('png/body-top-cover.png'), '9bf7a943548d94a80c61b8648dbed50ef8f35cfe252a7df732f4fe542680786c')
  assert.equal(sha('power/power-mid.png'), '71e18f1af8fecab29fa67a663f7956d3dc5598c28912b38bea0644cf9928f2b8')
})

test('the playlist title is drawn in Liberation Sans like the rack title, in its colour and size', () => {
  assert.equal(PLAYLIST.TITLE.text, 'TRACK LIST')
  assert.equal(RACK_TITLE.color, '#737373') // measured from "CASSETTE RACK" in rack/rack-top.png
  for (const k of ['x', 'capTop', 'capH', 'spacing', 'color'] as const) assert.equal(PLAYLIST.TITLE[k], RACK_TITLE[k], k)
  assert.match(read('views/PlaylistView.tsx'), /<TitleText[^>]*P\.TITLE/)
  assert.match(read('fonts.css'), /\.app-font\s*\{[^}]*font-family:\s*'Liberation Sans'/)
})
