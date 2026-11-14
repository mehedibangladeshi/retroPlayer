// Pure model of the cassette-rack album history (no electron, no fs).
import { SPINE_ASPECT, type RackState, type SortMode, type Spine } from '@shared/rack'

export interface RackEntry extends Spine {
  lastUsed: number
}
export interface RackFile {
  sort: SortMode
  entries: RackEntry[] // array order = custom order
}

const HEX = /^#[0-9a-f]{6}$/i

export function parseRack(raw: unknown): RackFile {
  const empty: RackFile = { sort: 'recent', entries: [] }
  if (!raw || typeof raw !== 'object' || !Array.isArray((raw as { entries?: unknown }).entries)) return empty
  const r = raw as { sort?: unknown; entries: unknown[] }
  const seen = new Set<string>()
  const entries: RackEntry[] = []
  for (const e of r.entries) {
    if (!e || typeof e !== 'object') continue
    const o = e as Record<string, unknown>
    if (typeof o.dir !== 'string' || !o.dir || seen.has(o.dir)) continue
    if (typeof o.text !== 'string' || typeof o.bg !== 'string' || !HEX.test(o.bg)) continue
    if (o.ink !== '#000000' && o.ink !== '#ffffff') continue
    if (o.image !== null && typeof o.image !== 'string') continue
    if (typeof o.lastUsed !== 'number' || !Number.isFinite(o.lastUsed)) continue
    seen.add(o.dir)
    entries.push({ dir: o.dir, text: o.text, image: o.image, bg: o.bg, ink: o.ink, lastUsed: o.lastUsed })
  }
  return { sort: r.sort === 'custom' ? 'custom' : 'recent', entries }
}

export function spineText(a: { dir: string; title: string | null; artist: string | null; year: string | null }): string {
  const clean = (s: string | null): string => (s ?? '').trim()
  const base = a.dir.split(/[\\/]/).filter(Boolean).pop() ?? a.dir
  const album = clean(a.title) || base
  const artist = clean(a.artist)
  const year = clean(a.year)
  return `${artist ? `${artist} - ` : ''}${album}${year ? ` (${year})` : ''}`
}

export function nameColor(text: string): string {
  let h = 0
  for (let i = 0; i < text.length; i++) h = (Math.imul(h, 31) + text.charCodeAt(i)) >>> 0
  const hue = h % 360
  const s = 0.45
  const l = 0.35
  const a = s * Math.min(l, 1 - l)
  const f = (n: number): string => {
    const k = (n + hue / 30) % 12
    const c = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))
    return Math.round(c * 255).toString(16).padStart(2, '0')
  }
  return `#${f(0)}${f(8)}${f(4)}`
}

export function meanRgb(bgra: Uint8Array): [number, number, number] {
  const n = Math.floor(bgra.length / 4)
  if (n === 0) return [0, 0, 0]
  let b = 0
  let g = 0
  let r = 0
  for (let i = 0; i < n * 4; i += 4) {
    b += bgra[i]
    g += bgra[i + 1]
    r += bgra[i + 2]
  }
  return [Math.round(r / n), Math.round(g / n), Math.round(b / n)]
}

function luminance([r, g, b]: [number, number, number]): number {
  const lin = (v: number): number => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}

export function inkFor(rgb: [number, number, number]): '#000000' | '#ffffff' {
  const l = luminance(rgb)
  // contrast vs white (1.05 / (l + .05)) beats vs black ((l + .05) / .05) only when l is low
  return 1.05 / (l + 0.05) > (l + 0.05) / 0.05 ? '#ffffff' : '#000000'
}

export function hexRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

export function spineCrop(w: number, h: number): { x: number; y: number; width: number; height: number } {
  let width = Math.round(h * SPINE_ASPECT)
  let height = h
  if (width > w) {
    width = w
    height = Math.round(w / SPINE_ASPECT)
  }
  width = Math.max(1, Math.min(w, width))
  height = Math.max(1, Math.min(h, height))
  return { x: Math.floor((w - width) / 2), y: Math.floor((h - height) / 2), width, height }
}

export function record(f: RackFile, s: Spine, now: number): RackFile {
  const entry: RackEntry = { ...s, lastUsed: now }
  const has = f.entries.some((e) => e.dir === s.dir)
  return { ...f, entries: has ? f.entries.map((e) => (e.dir === s.dir ? entry : e)) : [...f.entries, entry] }
}

export function remove(f: RackFile, dir: string): RackFile {
  return { ...f, entries: f.entries.filter((e) => e.dir !== dir) }
}

export function reorder(f: RackFile, dirs: string[]): RackFile {
  const first = [...new Set(dirs)].flatMap((d) => f.entries.filter((e) => e.dir === d))
  const listed = new Set(first.map((e) => e.dir))
  return { ...f, entries: [...first, ...f.entries.filter((e) => !listed.has(e.dir))] }
}

export function setSort(f: RackFile, sort: SortMode): RackFile {
  return { ...f, sort }
}

export function view(f: RackFile): RackState {
  const list = f.sort === 'recent' ? [...f.entries].sort((a, b) => b.lastUsed - a.lastUsed) : f.entries
  return { sort: f.sort, spines: list.map((e) => ({ dir: e.dir, text: e.text, image: e.image, bg: e.bg, ink: e.ink })) }
}
