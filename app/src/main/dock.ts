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
export type Limits = { minWidth: number; minHeight: number; maxWidth: number; maxHeight: number }

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
 * Where a dropped window lands: flush against the nearest edge (within tol) of one of `others`, with its start or
 * end edge (whichever is closer) aligned to that window if that is within tol too. Returns `win` unchanged if nothing is close.
 */
/** Start of a span [p, p+len) with its start or end edge (whichever is closer, within tol) aligned to [q, q+qLen). */
function align(p: number, len: number, q: number, qLen: number, tol: number): number {
  const ds = Math.abs(p - q)
  const de = Math.abs(p + len - (q + qLen))
  if (ds <= de) return ds <= tol ? q : p
  return de <= tol ? q + qLen - len : p
}

export function snap(win: Rect, others: Record<string, Rect>, tol = SNAP_PX): Rect {
  let best: { gap: number; rect: Rect } | null = null
  for (const o of Object.values(others)) {
    const options: Array<[number, Rect]> = []
    if (spanY(win, o)) {
      const y = align(win.y, win.height, o.y, o.height, tol)
      options.push([win.x - (o.x + o.width), { ...win, x: o.x + o.width, y }]) // on o's right
      options.push([o.x - (win.x + win.width), { ...win, x: o.x - win.width, y }]) // on o's left
    }
    if (spanX(win, o)) {
      const x = align(win.x, win.width, o.x, o.width, tol)
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

/** The nearest of `edges` to v within SNAP_PX, or null. */
function nearest(v: number, edges: number[]): number | null {
  let best: number | null = null
  for (const e of edges) if (Math.abs(e - v) <= SNAP_PX && (best === null || Math.abs(e - v) < Math.abs(best - v))) best = e
  return best
}

/**
 * At the end of a user resize (`from` -> `cur`), snap each moved edge to the nearest parallel edge of `others` that
 * shares (or touches) its span. A free window (aspect null) snaps edges independently; an aspect window snaps the
 * edge of the dimension that changed most and derives the other, keeping the unmoved edges fixed. cur if no target.
 */
export function snapResize(cur: Rect, from: Rect, others: Rect[], aspect: number | null, l: Limits): Rect {
  const touchY = others.filter((o) => o.y <= cur.y + cur.height && cur.y <= o.y + o.height)
  const touchX = others.filter((o) => o.x <= cur.x + cur.width && cur.x <= o.x + o.width)
  const xs = touchY.flatMap((o) => [o.x, o.x + o.width])
  const ys = touchX.flatMap((o) => [o.y, o.y + o.height])
  const right = cur.x + cur.width
  const bottom = cur.y + cur.height
  const movedL = cur.x !== from.x
  const movedR = right !== from.x + from.width
  const movedT = cur.y !== from.y
  const movedB = bottom !== from.y + from.height
  const tL = movedL ? nearest(cur.x, xs) : null
  const tR = movedR ? nearest(right, xs) : null
  const tT = movedT ? nearest(cur.y, ys) : null
  const tB = movedB ? nearest(bottom, ys) : null
  const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v))

  if (aspect === null) {
    if (tL === null && tR === null && tT === null && tB === null) return cur
    const x0 = tL ?? cur.x
    const y0 = tT ?? cur.y
    const width = clamp((tR ?? right) - x0, l.minWidth, l.maxWidth)
    const height = clamp((tB ?? bottom) - y0, l.minHeight, l.maxHeight)
    // A moved left/top edge with a fixed right/bottom edge keeps the fixed one through the clamp.
    const x = movedL && !movedR ? right - width : x0
    const y = movedT && !movedB ? bottom - height : y0
    return { x, y, width, height }
  }

  const byWidth = Math.abs(cur.width - from.width) / from.width > Math.abs(cur.height - from.height) / from.height
  let width: number
  let height: number
  if (byWidth) {
    if (tL === null && tR === null) return cur
    // Integer bounds (ceil/floor) keep the derived height inside its own limits after rounding.
    width = Math.round(clamp((tR ?? right) - (tL ?? cur.x), Math.max(l.minWidth, Math.ceil(l.minHeight * aspect)), Math.min(l.maxWidth, Math.floor(l.maxHeight * aspect))))
    height = clamp(Math.round(width / aspect), l.minHeight, l.maxHeight)
  } else {
    if (tT === null && tB === null) return cur
    height = Math.round(clamp((tB ?? bottom) - (tT ?? cur.y), Math.max(l.minHeight, Math.ceil(l.minWidth / aspect)), Math.min(l.maxHeight, Math.floor(l.maxWidth / aspect))))
    width = clamp(Math.round(height * aspect), l.minWidth, l.maxWidth)
  }
  return { x: movedL ? right - width : cur.x, y: movedT ? bottom - height : cur.y, width, height }
}

/**
 * Fill Gaps: each free window in order grows right, down, left then up to the nearest window whose span strictly
 * overlaps its own (or to the group's bounding box), within its max size, never shrinking. Returns changed windows only.
 */
export function fillGaps(rects: Record<string, Rect>, free: string[], limits: Record<string, Limits>): Record<string, Rect> {
  const all = Object.values(rects)
  if (!all.length) return {}
  const bx0 = Math.min(...all.map((r) => r.x))
  const by0 = Math.min(...all.map((r) => r.y))
  const bx1 = Math.max(...all.map((r) => r.x + r.width))
  const by1 = Math.max(...all.map((r) => r.y + r.height))
  const cur = { ...rects }
  const out: Record<string, Rect> = {}
  for (const id of free) {
    const start = cur[id]
    const l = limits[id]
    if (!start || !l) continue
    let w = start
    const rest = (): Rect[] => Object.entries(cur).filter(([k]) => k !== id).map(([, r]) => r)
    // A window already overlapping this one counts as an obstacle at its (behind) near edge: no growth that way.
    // right
    let edge = Math.min(bx1, ...rest().filter((o) => spanY(w, o) && (o.x >= w.x + w.width || overlaps(w, o))).map((o) => o.x))
    w = { ...w, width: Math.max(w.width, Math.min(edge - w.x, l.maxWidth)) }
    // down
    edge = Math.min(by1, ...rest().filter((o) => spanX(w, o) && (o.y >= w.y + w.height || overlaps(w, o))).map((o) => o.y))
    w = { ...w, height: Math.max(w.height, Math.min(edge - w.y, l.maxHeight)) }
    // left
    edge = Math.max(bx0, ...rest().filter((o) => spanY(w, o) && (o.x + o.width <= w.x || overlaps(w, o))).map((o) => o.x + o.width))
    const width = Math.max(w.width, Math.min(w.x + w.width - edge, l.maxWidth))
    w = { ...w, x: w.x + w.width - width, width }
    // up
    edge = Math.max(by0, ...rest().filter((o) => spanX(w, o) && (o.y + o.height <= w.y || overlaps(w, o))).map((o) => o.y + o.height))
    const height = Math.max(w.height, Math.min(w.y + w.height - edge, l.maxHeight))
    w = { ...w, y: w.y + w.height - height, height }
    cur[id] = w
    if (w.x !== start.x || w.y !== start.y || w.width !== start.width || w.height !== start.height) out[id] = w
  }
  return out
}
