// Pure decisions for the universal window lock (wired up in index.ts). While locked, all open windows act as one group.
// Type-only imports: Node's test runner (and tsc) cannot value-import a sibling here, so dock functions are passed in (`DockFns`).
import type { Docks, Rect, SizeRule } from './dock'

/** Lock can only be turned on when every open window is attached to the player's group (turning off is always allowed). */
export function canLock(visibleIds: string[], docks: Docks): boolean {
  const group = new Set(['player']) // the player's dock subtree
  for (let grew = true; grew; ) {
    grew = false
    for (const [k, d] of Object.entries(docks)) if (d && group.has(d.to) && !group.has(k)) grew = !!group.add(k)
  }
  return visibleIds.every((id) => id === 'player' || group.has(id))
}

/** A saved lock survives a restart only if the saved arrangement is still one group (the display may have changed). */
export const restoreLocked = (saved: boolean | undefined, visibleIds: string[], docks: Docks): boolean => saved === true && canLock(visibleIds, docks)

/** Each window's offset from the dragged window's position at the start of a drag. */
export function grabOffsets(rects: Record<string, Rect>, id: string, at: Rect): Record<string, { dx: number; dy: number }> {
  return Object.fromEntries(Object.entries(rects).map(([k, r]) => [k, { dx: r.x - at.x, dy: r.y - at.y }]))
}
// Absolute positions (offset + the dragged window's now), not deltas: a stale getBounds() on Linux then cannot make the group drift.
export function placeGroup(rects: Record<string, Rect>, offsets: Record<string, { dx: number; dy: number }>, id: string, now: Rect): Record<string, Rect> {
  return Object.fromEntries(Object.entries(rects).map(([k, r]) => [k, k === id ? now : { ...r, x: now.x + offsets[k].dx, y: now.y + offsets[k].dy }]))
}

/**
 * New bounds for every window after the user resized `resized` to `next`. Shaded windows keep their size (a bar is not
 * scaled); the rest scale by one factor (groupResize) and the whole group is laid out again from its docks.
 */
export interface DockFns {
  groupResize: (rects: Record<string, Rect>, docks: Docks, rules: Record<string, SizeRule>, resized: string, next: Rect) => Record<string, Rect>
  layout: (rects: Record<string, Rect>, docks: Docks) => Record<string, Rect>
}
export function lockedResize(fns: DockFns, rects: Record<string, Rect>, docks: Docks, rules: Record<string, SizeRule>, shaded: string[], resized: string, next: Rect): Record<string, Rect> {
  docks = visibleDocks(docks, Object.keys(rects))
  const open = Object.fromEntries(Object.entries(rects).filter(([id]) => !shaded.includes(id)))
  const sized = { ...rects, ...fns.groupResize(open, docks, rules, resized, next) }
  return fns.layout(sized, docks)
}

/** A move this far in one report is treated as unconfirmed (openbox briefly reports (0,0) while it reparents a window). */
export const isJump = (last: Rect, now: Rect, limit = 200): boolean => Math.hypot(now.x - last.x, now.y - last.y) > limit

/** Two jump reports in a row that are near each other: a fast drag, not a one-off bogus report followed by a return. */
export const jumpConfirmed = (first: Rect, second: Rect, limit = 200): boolean => !isJump(first, second, limit)

/**
 * The docks among the visible windows only. layout() and groupResize() treat a window whose anchor is missing as a
 * root, so a window docked to a hidden one is re-anchored to its nearest visible ancestor (same side and ratio).
 */
export function visibleDocks(docks: Docks, visible: string[]): Docks {
  const out: Docks = {}
  for (const id of visible) {
    let d = docks[id]
    for (let hops = 0; d && !visible.includes(d.to) && hops < 20; hops++) d = docks[d.to] && { ...d, to: docks[d.to]!.to }
    if (d && visible.includes(d.to)) out[id] = d
  }
  return out
}
