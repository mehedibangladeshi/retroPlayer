import type { Rect } from './dock'

// The rolled-up rect: same top edge and width, the design bar at the scale the art is drawn at (the tighter of width and
// height; a free window can be wider than its design shape).
export const shadedBounds = (b: Rect, designW: number, barH: number, designH?: number): Rect =>
  ({ x: b.x, y: b.y, width: b.width, height: Math.round(barH * Math.min(b.width / designW, designH ? b.height / designH : Infinity)) })

// The window may have been dragged while shaded: keep its new position, restore the old size.
export const expandedAt = (current: Rect, expanded: Rect): Rect => ({ x: current.x, y: current.y, width: expanded.width, height: expanded.height })

// Keep a rect inside a display work area (unshading grows the window downward and may push it off screen).
export const clampInto = (r: Rect, a: Rect): Rect => ({
  ...r,
  x: Math.max(a.x, Math.min(r.x, a.x + a.width - r.width)),
  y: Math.max(a.y, Math.min(r.y, a.y + a.height - r.height))
})
