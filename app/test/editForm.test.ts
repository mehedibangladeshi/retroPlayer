import { test } from 'node:test'
import assert from 'node:assert/strict'
import { backgroundPosition, initialForm, offsetFromDrag, toSave } from '../src/renderer/src/views/editForm.ts'

const state = { dir: '/m/a', defaultText: 'A', cover: null, design: null, custom: { cover: 'x.jpg' } }

test('initialForm defaults: red design, centred, no solid colour, no ink', () => {
  const f = initialForm(state)
  assert.equal(f.design, 'red')
  assert.equal(f.spineOffset, 0.5)
  assert.equal(f.solid, false)
  assert.equal(f.ink, null)
  assert.equal(f.text, '')
})

test('toSave never carries a cover, and omits the token unless a cover was picked', () => {
  const s = toSave(state, initialForm(state))
  assert.ok(!('cover' in s.custom))
  assert.ok(!('coverToken' in s))
  assert.equal(s.dir, '/m/a')
  assert.equal(toSave(state, { ...initialForm(state), token: 't1' }).coverToken, 't1')
})

test('toSave trims text and drops empty text', () => {
  assert.equal(toSave(state, { ...initialForm(state), text: '  Hi  ' }).custom.text, 'Hi')
  assert.ok(!('text' in toSave(state, { ...initialForm(state), text: '   ' }).custom))
})

test('toSave keeps spineColor only when the solid toggle is on, ink only when set', () => {
  const f = { ...initialForm(state), spineColor: '#112233' }
  assert.ok(!('spineColor' in toSave(state, f).custom))
  assert.equal(toSave(state, { ...f, solid: true }).custom.spineColor, '#112233')
  assert.ok(!('ink' in toSave(state, f).custom))
  assert.equal(toSave(state, { ...f, ink: '#ffffff' }).custom.ink, '#ffffff')
})

test('offsetFromDrag clamps to 0..1', () => {
  assert.equal(offsetFromDrag(-10, 300, 40), 0)
  assert.equal(offsetFromDrag(999, 300, 40), 1)
  assert.equal(offsetFromDrag(130, 300, 40), 0.5)
  assert.equal(offsetFromDrag(5, 40, 40), 0.5)
})

test('backgroundPosition maps the offset to a percentage', () => {
  assert.equal(backgroundPosition(0.25), '25% 50%')
})
