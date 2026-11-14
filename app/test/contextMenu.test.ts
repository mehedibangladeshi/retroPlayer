import { test } from 'node:test'
import assert from 'node:assert/strict'
import { contextMenu, parseHidden, setHidden } from '../src/main/contextMenu.ts'

const windows = [
  { label: 'Playlist', visible: true },
  { label: 'Album', visible: false }
]

test('contextMenu: Windows comes first and lists every window as a checkbox ticked by its visibility', () => {
  const [first] = contextMenu(windows, () => {})
  assert.equal(first.label, 'Windows')
  const sub = first.submenu as { label: string; type: string; checked: boolean }[]
  assert.deepEqual(sub.map(({ label, type, checked }) => ({ label, type, checked })), [
    { label: 'Playlist', type: 'checkbox', checked: true },
    { label: 'Album', type: 'checkbox', checked: false }
  ])
})

test('contextMenu: clicking a window asks to flip its visibility', () => {
  const calls: [number, boolean][] = []
  const sub = contextMenu(windows, (i, show) => calls.push([i, show]))[0].submenu as { click: () => void }[]
  sub[0].click()
  sub[1].click()
  assert.deepEqual(calls, [[0, false], [1, true]])
})

test('contextMenu: Settings, About and Check for Updates follow as placeholder items', () => {
  const labels = contextMenu(windows, () => {}).filter((i) => i.type !== 'separator').map((i) => i.label)
  assert.deepEqual(labels, ['Windows', 'Settings…', 'Check for Updates…', 'About'])
})

test('setHidden: hiding adds the window once, showing removes it', () => {
  assert.deepEqual(setHidden(undefined, 'album', true), ['album'])
  assert.deepEqual(setHidden(['album'], 'album', true), ['album'])
  assert.deepEqual(setHidden(['album', 'rack'], 'album', false), ['rack'])
  assert.deepEqual(setHidden(undefined, 'album', false), [])
})

test('parseHidden: keeps only window ids from a hand-edited or corrupt file', () => {
  assert.deepEqual(parseHidden(['album', 3, '', 'rack', null]), ['album', 'rack'])
  assert.equal(parseHidden('album'), undefined)
  assert.equal(parseHidden(undefined), undefined)
})
