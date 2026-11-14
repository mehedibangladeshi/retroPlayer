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
