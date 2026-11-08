/** A selected row whose name is cut off starts scrolling this long after it is selected. */
export const MARQUEE_DELAY_MS = 400
const SPEED = 60 // design px per second
const MIN_MS = 1000

/** How far a name must scroll to show its end, and how long that takes; null when it fits. */
export function marquee(textWidth: number, boxWidth: number): { shift: number; durationMs: number } | null {
  const shift = textWidth - boxWidth
  if (shift <= 0) return null
  return { shift, durationMs: Math.max(MIN_MS, (shift / SPEED) * 1000) }
}
