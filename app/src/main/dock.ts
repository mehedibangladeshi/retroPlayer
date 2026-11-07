// Window-docking geometry: any window can dock to any side of any other, forming trees rooted at the player.
// Pure: no Electron imports.

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}
export type Edge = 'left' | 'right' | 'top' | 'bottom'
/** The window sits on `side` of window `to`; `ratio` is its offset along that edge as a fraction of `to`'s length. */
export interface Dock {
  to: string
  side: Edge
  ratio: number
}
export type Docks = Record<string, Dock | undefined>

export const SNAP_PX = 12

/** Positive-area intersection; touching edges do not count. */
export function overlaps(a: Rect, b: Rect): boolean {
  return (
    a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height
  )
}

const spanX = (a: Rect, b: Rect): boolean => a.x < b.x + b.width && b.x < a.x + a.width
const spanY = (a: Rect, b: Rect): boolean => a.y < b.y + b.height && b.y < a.y + a.height

/** Which side of `a` the window `b` is flush against (within tol), or null. A corner touch is not a dock. */
function sideOf(a: Rect, b: Rect, tol = 1): Edge | null {
  if (spanY(a, b)) {
    if (Math.abs(b.x - (a.x + a.width)) <= tol) return 'right'
    if (Math.abs(a.x - (b.x + b.width)) <= tol) return 'left'
  }
  if (spanX(a, b)) {
    if (Math.abs(b.y - (a.y + a.height)) <= tol) return 'bottom'
    if (Math.abs(a.y - (b.y + b.height)) <= tol) return 'top'
  }
  return null
}

/** `win` moved flush onto `side` of `a`, offset along the edge by `ratio`. */
function place(a: Rect, win: Rect, side: Edge, ratio: number): Rect {
  return {
    ...win,
    x: Math.round(side === 'right' ? a.x + a.width : side === 'left' ? a.x - win.width : a.x + ratio * a.width),
    y: Math.round(side === 'bottom' ? a.y + a.height : side === 'top' ? a.y - win.height : a.y + ratio * a.height)
  }
}

/**
 * Where a dropped window lands: flush against the nearest edge (within tol) of one of `others`, with its start
 * edge aligned to that window if that is within tol too. Returns `win` unchanged if nothing is close.
 */
export function snap(win: Rect, others: Record<string, Rect>, tol = SNAP_PX): Rect {
  let best: { gap: number; rect: Rect } | null = null
  for (const o of Object.values(others)) {
    const options: Array<[number, Rect]> = []
    if (spanY(win, o)) {
      const y = Math.abs(win.y - o.y) <= tol ? o.y : win.y
      options.push([win.x - (o.x + o.width), { ...win, x: o.x + o.width, y }]) // on o's right
      options.push([o.x - (win.x + win.width), { ...win, x: o.x - win.width, y }]) // on o's left
    }
    if (spanX(win, o)) {
      const x = Math.abs(win.x - o.x) <= tol ? o.x : win.x
      options.push([win.y - (o.y + o.height), { ...win, x, y: o.y + o.height }]) // below o
      options.push([o.y - (win.y + win.height), { ...win, x, y: o.y - win.height }]) // above o
    }
    for (const [gap, rect] of options) {
      if (Math.abs(gap) <= tol && (!best || Math.abs(gap) < best.gap)) best = { gap: Math.abs(gap), rect }
    }
  }
  return best ? best.rect : win
}

/**
 * Docks read from geometry: breadth-first from each root in order, every window flush against a window already in
 * the tree docks to it. Windows not reached stay undocked. Never makes a cycle.
 */
export function inferDocks(rects: Record<string, Rect>, roots: string[]): Docks {
  const docks: Docks = {}
  const seen = new Set<string>()
  for (const root of roots) {
    if (!rects[root] || seen.has(root)) continue
    seen.add(root)
    const queue = [root]
    while (queue.length) {
      const id = queue.shift()!
      const a = rects[id]
      for (const [other, b] of Object.entries(rects)) {
        if (seen.has(other)) continue
        const side = sideOf(a, b)
        if (!side) continue
        const ratio = side === 'left' || side === 'right' ? (b.y - a.y) / a.height : (b.x - a.x) / a.width
        docks[other] = { to: id, side, ratio }
        seen.add(other)
        queue.push(other)
      }
    }
  }
  return docks
}

/** Every docked window placed against its (already placed) anchor; undocked windows and broken chains stay put. */
export function layout(rects: Record<string, Rect>, docks: Docks): Record<string, Rect> {
  const out = { ...rects }
  const placed = new Set(Object.keys(rects).filter((id) => !docks[id]))
  for (let grew = true; grew; ) {
    grew = false
    for (const id of Object.keys(rects)) {
      const d = docks[id]
      if (placed.has(id) || !d || !placed.has(d.to)) continue
      out[id] = place(out[d.to], rects[id], d.side, d.ratio)
      placed.add(id)
      grew = true
    }
  }
  return out
}

/** `id` and every window docked to it, directly or through others. */
export function subtree(docks: Docks, id: string): Set<string> {
  const out = new Set([id])
  for (let grew = true; grew; ) {
    grew = false
    for (const [k, d] of Object.entries(docks)) {
      if (d && out.has(d.to) && !out.has(k)) {
        out.add(k)
        grew = true
      }
    }
  }
  return out
}

/**
 * The smallest shift that brings a docked group (rects[0] = the player) inside the work area. On an axis where the
 * group does not fit, only the player is kept inside, and its start edge wins.
 */
export function fitGroup(rects: Rect[], work: Rect): { dx: number; dy: number } {
  const shift = (lo: number, hi: number, wLo: number, wHi: number): number => Math.max(wLo - lo, Math.min(0, wHi - hi))
  const p = rects[0]
  const minX = Math.min(...rects.map((r) => r.x))
  const maxX = Math.max(...rects.map((r) => r.x + r.width))
  const minY = Math.min(...rects.map((r) => r.y))
  const maxY = Math.max(...rects.map((r) => r.y + r.height))
  const dx = maxX - minX <= work.width ? shift(minX, maxX, work.x, work.x + work.width) : shift(p.x, p.x + p.width, work.x, work.x + work.width)
  const dy = maxY - minY <= work.height ? shift(minY, maxY, work.y, work.y + work.height) : shift(p.y, p.y + p.height, work.y, work.y + work.height)
  return { dx: Math.round(dx), dy: Math.round(dy) }
}

/** Side-window size: always the player's height, width from the window's aspect (never below minWidth). */
export function matchHeight(playerHeight: number, aspect: number, minWidth: number): { width: number; height: number } {
  return { width: Math.max(minWidth, Math.round(playerHeight * aspect)), height: playerHeight }
}
