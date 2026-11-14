// Pure helpers (no electron import) so node:test can load them.

// Bump when default window sizes change: saved bounds from older layouts are then dropped once.
export const LAYOUT_VERSION = 3

// 25% of the work-area width is provisional; the user decides the final value after testing.
export function defaultPlayerSize(
  workArea: { width: number; height: number },
  aspect: number,
  minWidth: number
): { width: number; height: number } {
  const width = Math.max(minWidth, Math.min(Math.round(0.25 * workArea.width), Math.floor(0.8 * workArea.height * aspect)))
  return { width, height: Math.round(width / aspect) }
}

interface Migratable { layoutVersion?: number; window?: unknown; playlistWindow?: unknown; albumWindow?: unknown; rackWindow?: unknown; powerWindow?: unknown }

// Old layout: drop saved bounds once and stamp the current version.
export function migrateSettings<T extends Migratable>(s: T): T {
  if (s.layoutVersion === LAYOUT_VERSION) return s
  const out = { ...s, layoutVersion: LAYOUT_VERSION }
  delete out.window
  delete out.playlistWindow
  delete out.albumWindow
  delete out.rackWindow
  delete out.powerWindow
  return out
}

// Every window's height stays within 50%..150% of the player's design height (616); widths follow each window's aspect.
const MIN_H = 308
const MAX_H = 924
export function sizeLimits(aspect: number): { minWidth: number; minHeight: number; maxWidth: number; maxHeight: number } {
  return { minWidth: Math.round(MIN_H * aspect), minHeight: MIN_H, maxWidth: Math.round(MAX_H * aspect), maxHeight: MAX_H }
}

interface Box { x: number; y: number; width: number; height: number }
// A user resize (`cur`, from `rest`) brought back to the window's aspect and limits. The dimension the user changed most
// leads; an edge the user moved stays where it is, so the opposite edge moves.
export function proportional(cur: Box, rest: Box, aspect: number, l: { minHeight: number; maxHeight: number }): Box {
  // Already in proportion (a window manager rounds the aspect by a pixel or two): leave it, or we would fight it.
  if (cur.height >= l.minHeight && cur.height <= l.maxHeight && Math.abs(cur.width - cur.height * aspect) <= 2) return cur
  const byWidth = Math.abs(cur.width - rest.width) / rest.width > Math.abs(cur.height - rest.height) / rest.height
  const height = Math.max(l.minHeight, Math.min(l.maxHeight, Math.round(byWidth ? cur.width / aspect : cur.height)))
  const width = Math.round(height * aspect)
  const x = cur.x !== rest.x ? cur.x + cur.width - width : cur.x
  const y = cur.y !== rest.y ? cur.y + cur.height - height : cur.y
  return { x, y, width, height }
}
