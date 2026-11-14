import { test } from 'node:test'
import assert from 'node:assert/strict'
import { contextMenu, parseHidden, setHidden } from '../src/main/contextMenu.ts'

const windows = [
  { label: 'Playlist', visible: true },
  { label: 'Album', visible: false }
]

const acts = { reset: () => {}, fillGaps: () => {} }

test('contextMenu: Windows comes first and lists every window as a checkbox ticked by its visibility', () => {
  const [first] = contextMenu(windows, () => {}, acts)
  assert.equal(first.label, 'Windows')
  const sub = (first.submenu as { label: string; type: string; checked: boolean }[]).filter((i) => i.type === 'checkbox')
  assert.deepEqual(sub.map(({ label, type, checked }) => ({ label, type, checked })), [
    { label: 'Playlist', type: 'checkbox', checked: true },
    { label: 'Album', type: 'checkbox', checked: false }
  ])
})

test('contextMenu: clicking a window asks to flip its visibility', () => {
  const calls: [number, boolean][] = []
  const sub = contextMenu(windows, (i, show) => calls.push([i, show]), acts)[0].submenu as { click: () => void }[]
  sub[0].click()
  sub[1].click()
  assert.deepEqual(calls, [[0, false], [1, true]])
})

test('contextMenu: the Windows submenu ends with a separator, Reset Windows and Fill Gaps that run their actions', () => {
  const calls: string[] = []
  const sub = contextMenu(windows, () => {}, { reset: () => calls.push('reset'), fillGaps: () => calls.push('fill') })[0].submenu as { label?: string; type?: string; click?: () => void }[]
  const tail = sub.slice(windows.length)
  assert.deepEqual(tail.map((i) => i.label ?? i.type), ['separator', 'Reset Windows', 'Fill Gaps'])
  tail[1].click!()
  tail[2].click!()
  assert.deepEqual(calls, ['reset', 'fill'])
})

test('contextMenu: Keyboard Shortcuts, then Settings, About and Check for Updates as placeholder items', () => {
  const labels = contextMenu(windows, () => {}, acts).filter((i) => i.type !== 'separator').map((i) => i.label)
  assert.deepEqual(labels, ['Windows', 'Keyboard Shortcuts', 'Settings…', 'Check for Updates…', 'About'])
})

test('contextMenu: Keyboard Shortcuts lists every app shortcut with its key, shown only (never bound)', () => {
  const sub = contextMenu(windows, () => {}, acts)[1].submenu as { label?: string; accelerator?: string; registerAccelerator?: boolean; type?: string }[]
  const rows = sub.filter((i) => i.type !== 'separator')
  for (const r of rows) assert.equal(r.registerAccelerator, false, r.label)
  const keys = rows.map((r) => r.accelerator)
  for (const k of ['Space', 'Left', 'Right', 'N', 'P', 'Up', 'Down', 'L', 'S', 'V', 'CmdOrCtrl+O', 'CmdOrCtrl+Shift+O', 'CmdOrCtrl+L', 'Enter']) {
    assert.ok(keys.includes(k), `missing ${k}`)
  }
  assert.equal(rows.find((r) => r.accelerator === 'Space')?.label, 'Play / Pause')
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
