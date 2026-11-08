import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// Player keys: the dark shade that Pause and Stop show while unavailable also marks every pressed key.
const css = readFileSync(new URL('../src/renderer/src/views/CassettePlayer.css', import.meta.url), 'utf8')
const rules = [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)].map(([, sel, body]) => ({ sel: sel.replace(/\/\*[\s\S]*?\*\//g, '').trim(), body }))
const filterOf = (selector: string): string | undefined =>
  rules.filter((r) => r.sel.split(',').map((s) => s.trim()).includes(selector)).map((r) => /filter:\s*([^;]+)/.exec(r.body)?.[1].trim()).filter(Boolean).at(-1)

test('one dark key shade is defined', () => {
  assert.match(css, /--key-dark:\s*brightness\(0\.8\)/)
})
test('only Pause and Stop look dark when unavailable; Rewind, Play and Forward look normal on first boot', () => {
  assert.equal(filterOf('.cp-btn:disabled'), undefined)
})
for (const sel of ['.cp-btn[aria-label="pause"]:disabled', '.cp-btn[aria-label="stop"]:disabled', '.cp-btn:active', '.cp-btn.pressed', '.cp-btn.latched', '.cp-btn.pressed:hover', '.cp-btn.latched:hover', '.cp-btn:not(:disabled):active:hover']) {
  test(`${sel} uses the dark key shade`, () => assert.equal(filterOf(sel), 'var(--key-dark)'))
}
test('no pressed state clears the shade', () => {
  assert.equal(/latched[^{]*\{[^}]*filter:\s*none/.test(css), false)
  assert.equal(/pressed[^{]*\{[^}]*filter:\s*none/.test(css), false)
})
