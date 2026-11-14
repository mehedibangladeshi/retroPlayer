// Drag-ghost size: the rack is CSS-scaled but Chromium's default drag image ignores that, so we size it ourselves.
export function dragGhostBox(
  rect: { width: number; height: number; left: number; top: number },
  clientX: number,
  clientY: number,
  k = 1.05
): { w: number; h: number; ox: number; oy: number } {
  return {
    w: Math.round(rect.width * k),
    h: Math.round(rect.height * k),
    ox: Math.round((clientX - rect.left) * k),
    oy: Math.round((clientY - rect.top) * k)
  }
}
