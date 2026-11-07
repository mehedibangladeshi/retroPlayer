import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// Each view has exactly one drag strip (its top bar). Any other element that
// inherits -webkit-app-region: drag swallows clicks, so the strip must be the
// only drag region and must be an empty self-closing element.
const views = [
  { name: 'Playlist', css: 'PlaylistView.css', tsx: 'PlaylistView.tsx', strip: 'pl-titlebar' },
  { name: 'Album', css: 'AlbumView.css', tsx: 'AlbumView.tsx', strip: 'al-titlebar' },
]

const read = (file: string) => readFileSync(new URL(`../src/renderer/src/views/${file}`, import.meta.url), 'utf8')
const stripCssComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '')
// Also drops // line comments so explanatory comments cannot trip the source checks.
const stripJsComments = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')

// Split flat CSS into { selector, body } rules. Enough for these files (no nested @media).
function cssRules(css: string) {
  const rules: { selector: string; body: string }[] = []
  for (const chunk of css.split('}')) {
    const brace = chunk.indexOf('{')
    if (brace === -1) continue
    rules.push({ selector: chunk.slice(0, brace).trim(), body: chunk.slice(brace + 1).trim() })
  }
  return rules
}

for (const v of views) {
  test(`${v.name}: the only app-region rule is .${v.strip} { app-region: drag }`, () => {
    const css = stripCssComments(read(v.css))
    // Strip is the only drag region, so a no-drag escape hatch is not allowed either.
    assert.ok(!/no-drag/.test(css), `${v.css}: contains "no-drag"; remove it and keep the strip as the only drag region`)

    const hits = cssRules(css).filter(r => /app-region/.test(r.body))
    assert.equal(hits.length, 1, `${v.css}: expected exactly one rule with app-region, found ${hits.length}: ${hits.map(r => r.selector).join(' | ')}`)

    const [rule] = hits
    const selectors = rule.selector.split(',').map(s => s.trim())
    assert.ok(selectors.includes(`.${v.strip}`), `${v.css}: the app-region rule targets "${rule.selector}", expected ".${v.strip}"`)

    const values = rule.body.split(';').map(d => d.trim()).filter(d => /app-region\s*:/.test(d)).map(d => d.split(':')[1].trim())
    assert.ok(values.length > 0 && values.every(x => x === 'drag'), `${v.css}: .${v.strip} app-region must be "drag", got ${JSON.stringify(values)}`)
  })

  test(`${v.name}: no inline app-region in ${v.tsx}`, () => {
    // Drag regions are set in the CSS file only, never via React props or attributes.
    const m = stripJsComments(read(v.tsx)).match(/WebkitAppRegion|appRegion|app-region/)
    assert.ok(!m, `${v.tsx}: inline "${m?.[0]}" found; move drag handling to ${v.css}`)
  })

  test(`${v.name}: .${v.strip} is a self-closing empty element in ${v.tsx}`, () => {
    // Children inside the strip would inherit the drag region and block clicks.
    const src = stripJsComments(read(v.tsx))
    const opens = src.match(new RegExp(`<div\\s+className="${v.strip}"`, 'g')) ?? []
    assert.ok(opens.length > 0, `${v.tsx}: no <div className="${v.strip}"> element found`)
    const selfClosing = src.match(new RegExp(`<div\\s+className="${v.strip}"[^>]*/>`, 'g')) ?? []
    assert.equal(selfClosing.length, opens.length, `${v.tsx}: <div className="${v.strip}"> must be self-closing with no children (${opens.length} opening tag(s), ${selfClosing.length} self-closing)`)
  })

  test(`${v.name}: no double-click handlers in ${v.tsx}`, () => {
    // Double-click on the strip is not a supported gesture, and a handler there would race the drag region.
    const m = stripJsComments(read(v.tsx)).match(/onDoubleClick|dblclick/)
    assert.ok(!m, `${v.tsx}: double-click handler "${m?.[0]}" found; remove it`)
  })
}
