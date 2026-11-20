// Pure helpers for the cassette-rack IPC: argument checks at the renderer trust boundary and the right-click menu.
import type { MenuItemConstructorOptions } from 'electron'
import type { SortMode } from '@shared/rack'

const MAX_DIRS = 500

export function dirArg(v: unknown): string | null {
  return typeof v === 'string' && v ? v : null
}

export function dirsArg(v: unknown): string[] | null {
  if (!Array.isArray(v) || v.length === 0 || v.length > MAX_DIRS) return null
  return v.every((d) => typeof d === 'string' && d) ? (v as string[]) : null
}

export function rackMenuTemplate(sort: SortMode, hasDir: boolean, count: number, actions: { setSort: (s: SortMode) => void; remove: () => void; clear: () => void }): MenuItemConstructorOptions[] {
  const radio = (label: string, s: SortMode): MenuItemConstructorOptions => ({ label, type: 'radio', checked: sort === s, click: () => actions.setSort(s) })
  return [
    radio('Sort: Recent', 'recent'),
    radio('Sort: Custom', 'custom'),
    ...(hasDir ? [{ type: 'separator' } as const, { label: 'Remove from rack', click: actions.remove }] : []),
    { type: 'separator' },
    { label: 'Clear cassette rack…', enabled: count > 0, click: actions.clear }
  ]
}
