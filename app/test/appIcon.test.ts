import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// electron-builder builds the .icns/.ico/Linux icons from build/icon.png; macOS needs >= 512px square.
test('build/icon.png is a square PNG of at least 512px', () => {
  const png = readFileSync(new URL('../build/icon.png', import.meta.url))
  assert.equal(png.toString('latin1', 1, 4), 'PNG')
  const w = png.readUInt32BE(16)
  const h = png.readUInt32BE(20)
  assert.equal(w, h)
  assert.ok(w >= 512, `icon is ${w}px`)
})

// Linux (and dev on every OS) shows the window's own icon in the taskbar, not the bundle's.
test('the player window uses the app icon', () => {
  const main = readFileSync(new URL('../src/main/index.ts', import.meta.url), 'utf8')
  assert.match(main, /from '\.\.\/\.\.\/build\/icon\.png\?asset'/)
  assert.match(main, /\bicon\b[,:]/)
})
