/** Wait this long after a single click before opening the preview, so a double-click can play instead. Fallback until main reports the OS double-click time. */
export const PREVIEW_DELAY_MS = 500

/** What a mouse click on a spine means. `detail` is the click count (0 = keyboard-synthesised). */
export function spineClick(detail: number, dragged: boolean): 'preview' | 'play' | null {
  if (dragged || detail < 1) return null
  return detail === 1 ? 'preview' : detail === 2 ? 'play' : null
}

/** What a key on a focused spine means. */
export function spineKey(key: string): 'play' | 'preview' | null {
  return key === 'Enter' ? 'play' : key === ' ' ? 'preview' : null
}
