import type { MenuItemConstructorOptions } from 'electron'

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
    { type: 'separator' },
    // shortcut: placeholders that do nothing yet, wire them up when Settings, updates and About exist.
    { label: 'Settings…' },
    { label: 'Check for Updates…' },
    { label: 'About' }
  ]
}

// Side windows the user closed (by their hash), saved so they stay closed at the next launch.
export function setHidden(list: string[] | undefined, hash: string, hidden: boolean): string[] {
  const rest = (list ?? []).filter((h) => h !== hash)
  return hidden ? [...rest, hash] : rest
}

export function parseHidden(v: unknown): string[] | undefined {
  return Array.isArray(v) ? v.filter((h): h is string => typeof h === 'string' && h !== '') : undefined
}
