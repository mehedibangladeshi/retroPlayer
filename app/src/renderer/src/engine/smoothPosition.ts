/** Pure position smoothing between engine `position` events (display only, the engine stays authoritative). */

export function extrapolate(positionMs: number, lastPositionAt: number, now: number, durationMs: number | null, playing: boolean): number {
  if (!playing) return positionMs
  const p = positionMs + (now - lastPositionAt)
  return durationMs === null ? p : Math.min(p, durationMs)
}

/** Event jitter must not make the bar step backwards; a real seek back (>= tolerance) is shown at once. */
export function noBackslide(prevShown: number, next: number, toleranceMs = 250): number {
  return next < prevShown && prevShown - next < toleranceMs ? prevShown : next
}

export const HOLD_CLOSE_MS = 500
export const HOLD_TIMEOUT_MS = 1500

/** After a seek drop: the target to keep showing until the engine reports near it (or timeout), else null. */
export function holdTarget(target: number, engineMs: number, sentAt: number, now: number): number | null {
  return Math.abs(engineMs - target) < HOLD_CLOSE_MS || now - sentAt >= HOLD_TIMEOUT_MS ? null : target
}

export type Hold = { ms: number; at: number }

/** Latching step: the first time the hold releases it is dropped for good, so later playback past the target never re-holds. */
export function stepHold(hold: Hold | null, engineMs: number, now: number): Hold | null {
  return hold && holdTarget(hold.ms, engineMs, hold.at, now) === null ? null : hold
}
