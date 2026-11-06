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

interface Migratable { layoutVersion?: number; window?: unknown; playlistWindow?: unknown; albumWindow?: unknown }

// Old layout: drop saved bounds once and stamp the current version.
export function migrateSettings<T extends Migratable>(s: T): T {
  if (s.layoutVersion === LAYOUT_VERSION) return s
  const out = { ...s, layoutVersion: LAYOUT_VERSION }
  delete out.window
  delete out.playlistWindow
  delete out.albumWindow
  return out
}
