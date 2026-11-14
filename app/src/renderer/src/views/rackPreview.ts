/** Where the tracklist preview sits, in shelf content px: right of the spine if it fits in view, else left of it (never before the view). */
export function previewPlacement(
  spine: { left: number; width: number },
  view: { scrollLeft: number; width: number },
  panelW: number
): { left: number; side: 'right' | 'left' } {
  const r = spine.left + spine.width
  if (r + panelW <= view.scrollLeft + view.width) return { left: r, side: 'right' }
  return { left: Math.max(view.scrollLeft, spine.left - panelW), side: 'left' }
}
