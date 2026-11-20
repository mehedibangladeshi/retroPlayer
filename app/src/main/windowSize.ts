// Pure helpers (no electron import) so node:test can load them.

// Bump when default window sizes change: saved bounds from older layouts are then dropped once.
export const LAYOUT_VERSION = 3

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

export type Limits = { minWidth: number; maxWidth: number; minHeight: number; maxHeight: number }
const clamp = (v: number, lo: number, hi: number): number => Math.min(Math.max(lo, hi), Math.max(lo, Math.round(v)))
// A saved size brought inside the window's limits and the work area: a corrupt or hand-edited settings.json must not
// open a window larger than the screen. `extraH` is a fixed bar height outside the aspect (0: the whole window keeps it). `aspect` null is a free window (playlist, rack): width and height on their own.
export function fitSize(saved: { width: number; height: number }, aspect: number | null, l: Limits, area: { width: number; height: number }, extraH = 0): { width: number; height: number } {
  if (aspect === null) return { width: clamp(saved.width, l.minWidth, Math.min(l.maxWidth, area.width)), height: clamp(saved.height, l.minHeight, Math.min(l.maxHeight, area.height)) }
  const width = clamp(saved.width, l.minWidth, Math.min(l.maxWidth, area.width, Math.floor((area.height - extraH) * aspect)))
  return { width, height: Math.round(width / aspect + extraH) }
}

interface Box { x: number; y: number; width: number; height: number }
// A window brought inside new limits (its display changed), keeping its position. `aspect` null: a free window.
export function clampToLimits(r: Box, aspect: number | null, l: Limits, extraH = 0): Box {
  // In range: untouched, so a size an X11 window manager rounded to its own aspect hint is not fought.
  if (r.width >= l.minWidth && r.width <= l.maxWidth && r.height >= l.minHeight && r.height <= l.maxHeight) return r
  const height = clamp(r.height, l.minHeight, l.maxHeight)
  return { ...r, width: aspect === null ? clamp(r.width, l.minWidth, l.maxWidth) : Math.round((height - extraH) * aspect), height }
}
// A user resize (`cur`, from `rest`) brought back to the window's aspect and limits. The dimension the user changed most
// leads; an edge the user moved stays where it is, so the opposite edge moves.
export function proportional(cur: Box, rest: Box, aspect: number, l: { minHeight: number; maxHeight: number }, extraH = 0): Box {
  // Already in proportion (a window manager rounds the aspect by a pixel or two): leave it, or we would fight it.
  if (cur.height >= l.minHeight && cur.height <= l.maxHeight && Math.abs(cur.width - (cur.height - extraH) * aspect) <= 2) return cur
  const byWidth = Math.abs(cur.width - rest.width) / rest.width > Math.abs(cur.height - rest.height) / rest.height
  const height = Math.max(l.minHeight, Math.min(l.maxHeight, Math.round(byWidth ? cur.width / aspect + extraH : cur.height)))
  const width = Math.round((height - extraH) * aspect)
  const x = cur.x !== rest.x ? cur.x + cur.width - width : cur.x
  const y = cur.y !== rest.y ? cur.y + cur.height - height : cur.y
  return { x, y, width, height }
}

export interface Area { width: number; height: number }

// Heights: a flat 200 px floor (small screens), up to 90% of the work area, capped at 2x design on huge screens.
export function heightRange(area: Area, designH: number): { minHeight: number; maxHeight: number } {
  const minHeight = 200
  return { minHeight, maxHeight: Math.max(minHeight, Math.min(Math.round(0.9 * area.height), Math.round(2 * designH))) }
}

// `free` windows (playlist, rack) get a looser min width so they can tile.
// `extraH`: a fixed bar height outside `aspect`, so width = (height - extraH) * aspect.
// `freeMin`: a free window's own smallest size (freeMin.ts); without it a free window is 200 x 200 at least.
export function displayLimits(aspect: number, area: Area, designH: number, free = false, extraH = 0, freeMin?: { width: number; height: number }): Limits {
  const { minHeight: floor, maxHeight } = heightRange(area, designH)
  const minHeight = free && freeMin ? freeMin.height : floor
  return { minWidth: free ? (freeMin?.width ?? floor) : Math.round((floor - extraH) * aspect), minHeight, maxWidth: Math.round((maxHeight - extraH) * aspect), maxHeight }
}

// groupW/groupH: the default window group's extent in player heights; it fills at most 75% of the work area.
export function defaultPlayerHeight(area: Area, groupW: number, groupH: number): number {
  const { minHeight, maxHeight } = heightRange(area, 616)
  const h = Math.round(Math.min((0.75 * area.width) / groupW, (0.75 * area.height) / groupH))
  return Math.min(maxHeight, Math.max(minHeight, h))
}

// First-run height: about 60% of the work area, never above the design size (large screens look as before).
export function initialHeight(designH: number, workAreaH: number): number {
  const { maxHeight } = heightRange({ width: 0, height: workAreaH }, designH)
  return Math.min(maxHeight, Math.max(200, Math.min(designH, Math.round(0.6 * workAreaH))))
}

// Whether a saved window rect still suits a work area: no bigger than it, and at least half of it visible.
export function fitsWorkArea(b: Box, a: Box): boolean {
  if (b.width > a.width || b.height > a.height) return false
  const ow = Math.min(b.x + b.width, a.x + a.width) - Math.max(b.x, a.x)
  const oh = Math.min(b.y + b.height, a.y + a.height) - Math.max(b.y, a.y)
  return ow > 0 && oh > 0 && ow * oh >= 0.5 * b.width * b.height
}
