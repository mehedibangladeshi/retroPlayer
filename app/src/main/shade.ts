import type { Rect } from './dock'
import { chromeBarPx } from '@shared/chrome'

// The rolled-up rect: same top edge and width, and a bar at the fixed chrome scale, so it does not change with the window size.
// designW and designH are kept so callers stay unchanged; they no longer affect the height.
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- designH is kept only so the 4-argument call in index.ts compiles
export const shadedBounds = (b: Rect, designW: number, barH: number, designH?: number): Rect =>
  ({ x: b.x, y: b.y, width: b.width, height: Math.round(chromeBarPx(barH)) })

// The window may have been dragged while shaded: keep its new position, restore the old size.
export const expandedAt = (current: Rect, expanded: Rect): Rect => ({ x: current.x, y: current.y, width: expanded.width, height: expanded.height })

// Keep a rect inside a display work area (unshading grows the window downward and may push it off screen).
export const clampInto = (r: Rect, a: Rect): Rect => ({
  ...r,
  x: Math.max(a.x, Math.min(r.x, a.x + a.width - r.width)),
  y: Math.max(a.y, Math.min(r.y, a.y + a.height - r.height))
})
