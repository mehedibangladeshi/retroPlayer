import { test } from 'node:test'
import assert from 'node:assert/strict'
import { contextMenu, parseHidden, parseLocked, setHidden } from '../src/main/contextMenu.ts'

const windows = [
  { label: 'Playlist', visible: true },
  { label: 'Album', visible: false }
]

const acts = { reset: () => {}, fillGaps: () => {} }
const boost = { db: 0, set: () => {} }

test('contextMenu: Windows comes first and lists every window as a checkbox ticked by its visibility', () => {
  const [first] = contextMenu(windows, () => {}, acts, boost)
  assert.equal(first.label, 'Windows')
  const sub = (first.submenu as { label: string; type: string; checked: boolean }[]).filter((i) => i.type === 'checkbox' && i.label !== 'Lock Windows')
  assert.deepEqual(sub.map(({ label, type, checked }) => ({ label, type, checked })), [
    { label: 'Playlist', type: 'checkbox', checked: true },
    { label: 'Album', type: 'checkbox', checked: false }
  ])
})

test('contextMenu: clicking a window asks to flip its visibility', () => {
  const calls: [number, boolean][] = []
  const sub = contextMenu(windows, (i, show) => calls.push([i, show]), acts, boost)[0].submenu as { click: () => void }[]
  sub[0].click()
  sub[1].click()
  assert.deepEqual(calls, [[0, false], [1, true]])
})

test('contextMenu: the Windows submenu ends with a separator, Reset Windows and Fill Gaps that run their actions', () => {
  const calls: string[] = []
  const sub = contextMenu(windows, () => {}, { reset: () => calls.push('reset'), fillGaps: () => calls.push('fill') }, boost)[0].submenu as { label?: string; type?: string; click?: () => void }[]
  const tail = sub.slice(windows.length)
  assert.deepEqual(tail.map((i) => i.label ?? i.type), ['separator', 'Reset Windows', 'Fill Gaps', 'Lock Windows'])
  tail[1].click!()
  tail[2].click!()
  assert.deepEqual(calls, ['reset', 'fill'])
})

test('contextMenu: Keyboard Shortcuts, Edit Album, then Settings, About and Check for Updates as placeholder items', () => {
  const labels = contextMenu(windows, () => {}, acts, boost).filter((i) => i.type !== 'separator').map((i) => i.label)
  assert.deepEqual(labels, ['Windows', 'Volume boost', 'Keyboard Shortcuts', 'Edit Album…', 'Settings…', 'Check for Updates…', 'About'])
})

test('contextMenu: Keyboard Shortcuts lists every app shortcut with its key, shown only (never bound)', () => {
  const sub = contextMenu(windows, () => {}, acts, boost)[2].submenu as { label?: string; accelerator?: string; registerAccelerator?: boolean; type?: string }[]
  const rows = sub.filter((i) => i.type !== 'separator')
  for (const r of rows) assert.equal(r.registerAccelerator, false, r.label)
  const keys = rows.map((r) => r.accelerator)
  for (const k of ['Space', 'Left', 'Right', 'N', 'P', 'Up', 'Down', 'L', 'S', 'V', 'CmdOrCtrl+O', 'CmdOrCtrl+Shift+O', 'CmdOrCtrl+L', 'Enter']) {
    assert.ok(keys.includes(k), `missing ${k}`)
  }
  assert.equal(rows.find((r) => r.accelerator === 'Space')?.label, 'Play / Pause')
})

test('contextMenu: Volume boost is a radio list of the steps, the current one checked, click sets it', () => {
  const calls: number[] = []
  const item = contextMenu(windows, () => {}, acts, { db: 6, set: (d) => calls.push(d) })[1]
  assert.equal(item.label, 'Volume boost')
  const sub = item.submenu as { label: string; type: string; checked: boolean; click: () => void }[]
  assert.deepEqual(sub.map((i) => [i.label, i.type, i.checked]), [
    ['Off', 'radio', false], ['+3 dB', 'radio', false], ['+6 dB', 'radio', true], ['+9 dB', 'radio', false], ['+12 dB', 'radio', false]
  ])
  sub[4].click()
  assert.deepEqual(calls, [12])
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

test('parseLocked: only a boolean survives', () => {
  assert.equal(parseLocked(true), true)
  assert.equal(parseLocked(false), false)
  assert.equal(parseLocked('yes'), undefined)
  assert.equal(parseLocked(1), undefined)
  assert.equal(parseLocked(undefined), undefined)
})

test('contextMenu: Lock Windows is a checkbox ticked by locked, enabled when locked or lockable, and runs toggleLock', () => {
  const find = (locked: boolean, canLock: boolean, toggleLock = () => {}) =>
    (contextMenu(windows, () => {}, { ...acts, toggleLock }, boost, locked, canLock)[0].submenu as { label?: string; type?: string; checked?: boolean; enabled?: boolean; click?: () => void }[]).find((i) => i.label === 'Lock Windows')!
  assert.equal(find(false, true).type, 'checkbox')
  assert.deepEqual([find(false, true).checked, find(false, true).enabled], [false, true])
  assert.deepEqual([find(false, false).checked, find(false, false).enabled], [false, false])
  assert.deepEqual([find(true, false).checked, find(true, false).enabled], [true, true])
  let n = 0
  find(false, true, () => n++).click!()
  assert.equal(n, 1)
})
