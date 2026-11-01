// Window-docking geometry for the player and its two side windows. Pure: no Electron imports.

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}
export type Side = 'left' | 'right'

export const SNAP_PX = 12

/** Positive-area intersection; touching edges do not count. */
export function overlaps(a: Rect, b: Rect): boolean {
  return (
    a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height
  )
}

const flushX = (player: Rect, width: number, side: Side): number =>
  side === 'right' ? player.x + player.width : player.x - width

/** A side window of `size`, flush against the player and top-aligned. */
export function placeSide(player: Rect, size: { width: number; height: number }, side: Side): Rect {
  return { x: flushX(player, size.width, side), y: player.y, width: size.width, height: size.height }
}

/** Move `win` horizontally so it is flush with the player; y and size are kept. */
export function snapTo(player: Rect, win: Rect, side: Side): Rect {
  return { ...win, x: flushX(player, win.width, side) }
}

export function isAttached(player: Rect, win: Rect, side: Side, tol = SNAP_PX): boolean {
  const gap = side === 'right' ? win.x - (player.x + player.width) : player.x - (win.x + win.width)
  const vertical = win.y < player.y + player.height && player.y < win.y + win.height
  return Math.abs(gap) <= tol && vertical
}

/** The player moved or resized from -> to: keep the window's offset to the player's top, stay flush. */
export function follow(win: Rect, from: Rect, to: Rect, side: Side): Rect {
  return snapTo(to, { ...win, y: to.y + (win.y - from.y) }, side)
}

export function fitAll(
  player: Rect,
  sides: Partial<Record<Side, Rect>>,
  work: Rect
): { player: Rect } & Partial<Record<Side, Rect>> {
  const lw = sides.left?.width ?? 0
  const rw = sides.right?.width ?? 0

  // Clamp y into the work area (top wins if the player is taller than the work area).
  const y = Math.max(work.y, Math.min(player.y, work.y + work.height - player.height))

  let x: number
  if (lw + player.width + rw > work.width) {
    x = work.x + (work.width - player.width) / 2
  } else {
    // Smallest horizontal shift that brings the whole [left..right] span inside work.
    const left = player.x - lw
    const right = player.x + player.width + rw
    x = player.x
    if (left < work.x) x += work.x - left
    else if (right > work.x + work.width) x -= right - (work.x + work.width)
  }
  const p: Rect = {
    x: Math.round(x),
    y: Math.round(y),
    width: Math.round(player.width),
    height: Math.round(player.height)
  }

  const out: { player: Rect } & Partial<Record<Side, Rect>> = { player: p }
  for (const side of ['left', 'right'] as const) {
    const s = sides[side]
    if (!s) continue
    const sy = s.y < p.y + p.height && p.y < s.y + s.height ? s.y : p.y
    out[side] = {
      x: Math.round(flushX(p, s.width, side)),
      y: Math.round(sy),
      width: Math.round(s.width),
      height: Math.round(s.height)
    }
  }
  return out
}

/** Top-left anchored, aspect-locked resize from a bottom-right grip drag. */
export function gripResize(
  start: Rect,
  dx: number,
  dy: number,
  aspect: number,
  minW: number,
  minH: number
): Rect {
  let width = Math.round(Math.max(minW, start.width + Math.max(dx, dy * aspect)))
  let height = Math.round(width / aspect)
  if (height < minH) {
    height = minH
    width = Math.round(minH * aspect)
  }
  return { x: start.x, y: start.y, width, height }
}
