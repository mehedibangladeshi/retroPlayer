// Pure helpers for the power deck visualizer (no DOM), unit tested in app/test/smoothing.test.ts.

// Same rule as powerMath.decay (not imported: node tests need explicit .ts extensions, tsc forbids them).
const fall = (p: number, n: number, dt: number, f: number): number => (n >= p ? n : Math.max(n, p - f * dt))

/** Per-band decay (rise at once, fall slowly), padded with zeros to `count` bands. */
export function smoothBands(prev: number[], next: number[], dtMs: number, fallPerMs: number, count: number): number[] {
  return Array.from({ length: count }, (_, i) => fall(prev[i] ?? 0, next[i] ?? 0, dtMs, fallPerMs))
}

/** SVG polyline points for a -1..1 wave across w x h, centred vertically (+1 is up). Empty wave = flat line. */
export function wavePoints(wave: number[], w: number, h: number): string {
  const pts = wave.length >= 2 ? wave : [0, 0]
  return pts.map((v, i) => `${((i / (pts.length - 1)) * w).toFixed(1)},${((1 - v) * h / 2).toFixed(1)}`).join(' ')
}
