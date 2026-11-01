export type RowKeyAction = { type: 'play'; index: number } | { type: 'select'; index: number } | null

/** Playlist keyboard rules: Enter plays the focused row (else the selected one); arrows move the selection. */
export function rowKeyAction(key: string, focusedIndex: number | null, selectedIndex: number, count: number): RowKeyAction {
  if (key === 'Enter') {
    const index = focusedIndex ?? selectedIndex
    return index >= 0 ? { type: 'play', index } : null
  }
  if ((key === 'ArrowDown' || key === 'ArrowUp') && count > 0) {
    const down = key === 'ArrowDown'
    // Arrows step from the focused row when one has focus, else from the selected row.
    const base = focusedIndex ?? selectedIndex
    const index = base < 0 ? (down ? 0 : count - 1) : Math.max(0, Math.min(count - 1, base + (down ? 1 : -1)))
    return { type: 'select', index }
  }
  return null
}
