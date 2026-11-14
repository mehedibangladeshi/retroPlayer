import type { MenuItemConstructorOptions } from 'electron'

// Every keyboard shortcut (renderer: input/useKeyboard.ts, input/powerKeys.ts, views/rowKeys.ts). Keep in step with them.
const SHORTCUTS: ([label: string, key: string] | null)[] = [
  ['Play / Pause', 'Space'],
  ['Previous / Restart (hold: rewind)', 'Left'],
  ['Next Track (hold: fast-forward)', 'Right'],
  ['Next Track', 'N'],
  ['Previous Track', 'P'],
  null,
  ['Volume Up', 'Up'],
  ['Volume Down', 'Down'],
  ['Loop Song', 'L'],
  ['Shuffle', 'S'],
  ['Visualizer: Bars / Wave (power deck)', 'V'],
  null,
  ['Open File…', 'CmdOrCtrl+O'],
  ['Open Album…', 'CmdOrCtrl+Shift+O'],
  ['Show Playlist', 'CmdOrCtrl+L'],
  null,
  ['Playlist: Select Previous', 'Up'],
  ['Playlist: Select Next', 'Down'],
  ['Playlist: Play Selected', 'Enter']
]

// The player's right-click menu. `toggle(i, show)` shows or hides windows[i].
export function contextMenu(
  windows: { label: string; visible: boolean }[],
  toggle: (i: number, show: boolean) => void
): MenuItemConstructorOptions[] {
  return [
    {
      label: 'Windows',
      submenu: windows.map((w, i) => ({ label: w.label, type: 'checkbox', checked: w.visible, click: () => toggle(i, !w.visible) }))
    },
    {
      label: 'Keyboard Shortcuts',
      // The keys only show beside each item: the windows handle them, so the menu must not bind them.
      submenu: SHORTCUTS.map((s) => (s ? { label: s[0], accelerator: s[1], registerAccelerator: false } : { type: 'separator' }))
    },
    { type: 'separator' },
    // shortcut: placeholders that do nothing yet, wire them up when Settings, updates and About exist.
    { label: 'Settings…' },
    { label: 'Check for Updates…' },
    { label: 'About' }
  ]
}

// Linux reports one right-click on a drag region twice (the page's 'context-menu' and 'system-context-menu'):
// calls within 300 ms of the last shown menu are the same click.
export function oncePerClick(show: () => void): (now?: number) => void {
  let last = -Infinity
  return (now = Date.now()) => {
    if (now - last < 300) return
    last = now
    show()
  }
}

// Side windows the user closed (by their hash), saved so they stay closed at the next launch.
export function setHidden(list: string[] | undefined, hash: string, hidden: boolean): string[] {
  const rest = (list ?? []).filter((h) => h !== hash)
  return hidden ? [...rest, hash] : rest
}

export function parseHidden(v: unknown): string[] | undefined {
  return Array.isArray(v) ? v.filter((h): h is string => typeof h === 'string' && h !== '') : undefined
}
