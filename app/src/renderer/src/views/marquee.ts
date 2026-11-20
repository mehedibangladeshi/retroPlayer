/** A selected row whose name is cut off starts scrolling this long after it is selected. */
export const MARQUEE_DELAY_MS = 400
/** Full out-and-back trips before the name rests at its start. */
export const MARQUEE_CYCLES = 3
const SPEED = 45 // design px per second
const MIN_MS = 1333

/** How far a name must scroll to show its end, how long one way takes, and the CSS iteration count; null when it fits. */
export function marquee(textWidth: number, boxWidth: number): { shift: number; durationMs: number; iterations: number } | null {
  const shift = textWidth - boxWidth
  if (shift <= 0) return null
  // `alternate` makes each way one iteration; an even count ends back at the start.
  return { shift, durationMs: Math.max(MIN_MS, (shift / SPEED) * 1000), iterations: MARQUEE_CYCLES * 2 }
}
