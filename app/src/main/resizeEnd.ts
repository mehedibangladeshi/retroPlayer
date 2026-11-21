// Height to re-lock a bar window's native aspect at when a resize ends: the corrected height if the size was fixed,
// else the current one. X11 window managers keep the old lock otherwise and undo the correction. null = no bar, no lock.
export function lockHeightAfterResize(extraH: number, cur: { height: number }, fixed: { height: number } | null): number | null {
  return extraH > 0 ? (fixed ?? cur).height : null
}
