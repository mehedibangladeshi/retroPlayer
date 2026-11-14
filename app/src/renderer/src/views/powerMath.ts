// Pure maths for the power deck controls (no DOM), unit tested in app/test/powerMath.test.ts.
export const KNOB_SWEEP = 270 // degrees from 0 to 10
export const VOLUME_STEP = 0.05

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v))

/** Rotation to apply to the baked knob disc (its pointer is drawn at volume 0.8333): volume*270 - 225 degrees. */
export function knobRotation(volume: number): number {
  return volume * KNOB_SWEEP - 225
}

/** Vertical drag: up is louder. 200 design px = full range. Clamped 0..1. */
export function dragVolume(startVolume: number, dyDesignPx: number): number {
  return clamp01(startVolume - dyDesignPx / 200)
}

/** Click at (dx, dy) design px from the knob centre: the volume whose pointer points there (0 lower left, 10 lower
 *  right, 5 straight up). The dead zone at the bottom snaps to the nearer end; too near the centre gives null. */
export function angleVolume(dx: number, dy: number): number | null {
  if (Math.hypot(dx, dy) < 8) return null
  const deg = (Math.atan2(dx, -dy) * 180) / Math.PI // 0 = up, clockwise positive, -180..180
  if (Math.abs(deg) > 135) return dx < 0 ? 0 : 1
  return (deg + 135) / KNOB_SWEEP
}

/** Wheel / arrow keys: one VOLUME_STEP up or down, clamped, rounded to avoid float drift. */
export function stepVolume(volume: number, dir: -1 | 1): number {
  return Math.round(clamp01(volume + dir * VOLUME_STEP) * 1000) / 1000
}

/** x in design px to a position in ms within the duration, clamped; no duration gives null. */
export function seekAt(x: number, seek: { x: number; w: number }, durationMs: number | null): number | null {
  if (durationMs === null) return null
  return clamp01((x - seek.x) / seek.w) * durationMs
}

/** VU needle angle for an rms 0..1, mapped in dB (-40..0) from minDeg to maxDeg, clamped. */
export function needleAngle(rms: number, minDeg: number, maxDeg: number): number {
  const db = rms > 0 ? 20 * Math.log10(rms) : -Infinity
  return minDeg + clamp01((db + 40) / 40) * (maxDeg - minDeg)
}

/** Smooth meter values: rise at once, fall by fallPerMs per ms. */
export function decay(prev: number, next: number, dtMs: number, fallPerMs = 0.002): number {
  return next >= prev ? next : Math.max(next, prev - fallPerMs * dtMs)
}
