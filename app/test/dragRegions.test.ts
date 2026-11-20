import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// Each view has exactly one drag strip (its top bar). Any other element that
// inherits -webkit-app-region: drag swallows clicks, so the strip must be the
// only drag region and must be an empty self-closing element.
const views = [
  { name: 'Playlist', css: 'PlaylistView.css', tsx: 'PlaylistView.tsx', strip: 'pl-titlebar', lockedDrag: false },
  { name: 'Album', css: 'AlbumView.css', tsx: 'AlbumView.tsx', strip: 'al-titlebar', lockedDrag: true },
  { name: 'Rack', css: 'RackView.css', tsx: 'RackView.tsx', strip: 'rk-titlebar', lockedDrag: false },
  { name: 'Power deck', css: 'PowerView.css', tsx: 'PowerView.tsx', strip: 'pd-titlebar', lockedDrag: true },
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
    // Album and power may also set app-region, but only in .locked selectors (see the locked test below).
    if (!v.lockedDrag) assert.ok(!/no-drag/.test(css), `${v.css}: contains "no-drag"; remove it and keep the strip as the only drag region`)

    const hits = cssRules(css).filter(r => /app-region/.test(r.body) && !(v.lockedDrag && /\.locked/.test(r.selector)))
    assert.equal(hits.length, 1, `${v.css}: expected exactly one rule with app-region, found ${hits.length}: ${hits.map(r => r.selector).join(' | ')}`)

    const [rule] = hits
    const selectors = rule.selector.split(',').map(s => s.trim())
    assert.ok(selectors.includes(`.${v.strip}`), `${v.css}: the app-region rule targets "${rule.selector}", expected ".${v.strip}"`)

    const values = rule.body.split(';').map(d => d.trim()).filter(d => /app-region\s*:/.test(d)).map(d => d.split(':')[1].trim())
    assert.ok(values.length > 0 && values.every(x => x === 'drag'), `${v.css}: .${v.strip} app-region must be "drag", got ${JSON.stringify(values)}`)
  })

  if (v.lockedDrag) {
    test(`${v.name}: app-region beyond the strip only under .locked, drag paired with no-drag on button and input`, () => {
      const rules = cssRules(stripCssComments(read(v.css))).filter(r => /app-region/.test(r.body) && /\.locked/.test(r.selector))
      const withValue = (val: string) => rules.filter(r => new RegExp(`app-region\\s*:\\s*${val}\\b`).test(r.body))
      assert.ok(withValue('drag').length > 0, `${v.css}: no .locked rule makes the empty area draggable`)
      const noDrag = withValue('no-drag').flatMap(r => r.selector.split(',').map(s => s.trim()))
      for (const el of ['button', 'input']) {
        assert.ok(noDrag.some(s => new RegExp(`\\.locked\\b.*\\b${el}$`).test(s)), `${v.css}: no ".locked ... ${el}" no-drag selector`)
      }
    })
  }

  test(`${v.name}: root element gets the locked class in ${v.tsx}`, () => {
    if (!v.lockedDrag) return
    const src = read(v.tsx)
    assert.ok(/useLocked\(\)/.test(src) && /\$\{locked \? . locked./.test(src), `${v.tsx}: must use useLocked and add a "locked" class`)
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
