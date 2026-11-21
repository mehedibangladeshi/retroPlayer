// Pure model of the cassette-rack album history (no electron, no fs).
import { SPINE_ASPECT, type AlbumCustom, type RackState, type SortMode, type Spine } from '@shared/rack'
import { isCassetteDesign, randomDesign, type CassetteDesign } from '@shared/cassettes'
import type { Command, EngineEvent } from '@shared/protocol'

/** A spine as makeSpine returns it: the design is assigned by record/editAlbum. */
export type SpineBase = Omit<Spine, 'design'>
export interface RackEntry extends SpineBase {
  lastUsed: number
  design?: CassetteDesign
  custom?: AlbumCustom
  resume?: { index: number; path: string; positionMs: number } // where the album was left; main-only, never sent to renderers
}
export interface RackFile {
  sort: SortMode
  entries: RackEntry[] // array order = custom order
}

const HEX = /^#[0-9a-f]{6}$/i
const COVER_NAME = /^[a-f0-9]{8,64}\.jpg$/ // main writes JPEG only (readCover serves image/jpeg)

/** Keeps only the valid fields of an album's overrides; undefined when none survive. */
export function parseAlbumCustom(v: unknown): AlbumCustom | undefined {
  if (!v || typeof v !== 'object') return undefined
  const o = v as Record<string, unknown>
  const c: AlbumCustom = {}
  if (typeof o.cover === 'string' && COVER_NAME.test(o.cover)) c.cover = o.cover
  if (typeof o.spineOffset === 'number' && o.spineOffset >= 0 && o.spineOffset <= 1) c.spineOffset = o.spineOffset
  if (typeof o.spineColor === 'string' && HEX.test(o.spineColor)) c.spineColor = o.spineColor
  if (typeof o.ink === 'string' && HEX.test(o.ink)) c.ink = o.ink
  if (typeof o.text === 'string' && o.text.trim()) c.text = o.text.trim().slice(0, 200)
  return Object.keys(c).length ? c : undefined
}

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
    if (typeof o.ink !== 'string' || !HEX.test(o.ink)) continue
    if (o.image !== null && typeof o.image !== 'string') continue
    if (typeof o.lastUsed !== 'number' || !Number.isFinite(o.lastUsed)) continue
    seen.add(o.dir)
    const entry: RackEntry = { dir: o.dir, text: o.text, image: o.image, bg: o.bg, ink: o.ink, lastUsed: o.lastUsed }
    if (isCassetteDesign(o.design)) entry.design = o.design
    const custom = parseAlbumCustom(o.custom)
    if (custom) entry.custom = custom
    const rs = o.resume as Record<string, unknown> | null | undefined
    if (rs && typeof rs === 'object' && Number.isInteger(rs.index) && (rs.index as number) >= 0 && typeof rs.path === 'string' && rs.path && typeof rs.positionMs === 'number' && Number.isFinite(rs.positionMs) && rs.positionMs >= 0) {
      entry.resume = { index: rs.index as number, path: rs.path, positionMs: rs.positionMs }
    }
    entries.push(entry)
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

export function inkFor(rgb: [number, number, number]): string {
  const l = luminance(rgb)
  // contrast vs white (1.05 / (l + .05)) beats vs black ((l + .05) / .05) only when l is low
  return 1.05 / (l + 0.05) > (l + 0.05) / 0.05 ? '#ffffff' : '#000000'
}

export function hexRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

export function spineCrop(w: number, h: number, offset = 0.5): { x: number; y: number; width: number; height: number } {
  let width = Math.round(h * SPINE_ASPECT)
  let height = h
  if (width > w) {
    width = w
    height = Math.round(w / SPINE_ASPECT)
  }
  width = Math.max(1, Math.min(w, width))
  height = Math.max(1, Math.min(h, height))
  const t = Math.max(0, Math.min(1, offset))
  return { x: Math.floor((w - width) * t), y: Math.floor((h - height) * t), width, height }
}

const withoutDesign = (s: SpineBase): SpineBase => ({ dir: s.dir, text: s.text, image: s.image, bg: s.bg, ink: s.ink })

export function record(f: RackFile, s: SpineBase, now: number, rand?: () => number): RackFile {
  const old = f.entries.find((e) => e.dir === s.dir)
  const base = withoutDesign(s) // callers may pass a full Spine; the entry's design is kept or assigned below
  const entry: RackEntry = { ...base, lastUsed: now, design: old?.design ?? randomDesign(rand), ...(old?.custom && { custom: old.custom }), ...(old?.resume && { resume: old.resume }) }
  return { ...f, entries: old ? f.entries.map((e) => (e.dir === s.dir ? entry : e)) : [...f.entries, entry] }
}

/** Replaces one album's spine, design and overrides (the edit dialog's save). Unknown dir: unchanged. */
export function editAlbum(f: RackFile, dir: string, s: SpineBase, design: CassetteDesign, custom: AlbumCustom): RackFile {
  const base = withoutDesign(s)
  return { ...f, entries: f.entries.map((e) => (e.dir === dir ? { ...e, ...base, dir, design, custom } : e)) }
}

export function remove(f: RackFile, dir: string): RackFile {
  return { ...f, entries: f.entries.filter((e) => e.dir !== dir) }
}

export function clear(f: RackFile): RackFile {
  return { sort: f.sort, entries: [] }
}

export function reorder(f: RackFile, dirs: string[]): RackFile {
  const first = [...new Set(dirs)].flatMap((d) => f.entries.filter((e) => e.dir === d))
  const listed = new Set(first.map((e) => e.dir))
  return { ...f, entries: [...first, ...f.entries.filter((e) => !listed.has(e.dir))] }
}

export function setSort(f: RackFile, sort: SortMode): RackFile {
  return { ...f, sort }
}

export function view(f: RackFile, playing: string | null = null): RackState {
  const list = f.sort === 'recent' ? [...f.entries].sort((a, b) => b.lastUsed - a.lastUsed) : f.entries
  return { sort: f.sort, nowPlaying: playing !== null && f.entries.some((e) => e.dir === playing) ? playing : null, spines: list.map((e) => ({ dir: e.dir, text: e.text, image: e.image, bg: e.bg, ink: e.ink, design: e.design ?? null })) }
}

/** Where to resume an album: the saved file's index in the album's current track list (by path), or null to start fresh. */
export function resumePlan(resume: RackEntry['resume'] | undefined, trackPaths: string[]): { index: number; positionMs: number } | null {
  const index = resume ? trackPaths.indexOf(resume.path) : -1
  return resume && index >= 0 ? { index, positionMs: resume.positionMs } : null
}

/** Folds an engine event into the loaded album's resume point (like nextSession). Returns `f` itself when nothing changes. */
export function foldResume(f: RackFile, album: { dir: string; tracks: { path: string }[] } | null, evt: EngineEvent): RackFile {
  if (!album || (evt.type !== 'position' && evt.type !== 'state')) return f
  const e = f.entries.find((x) => x.dir === album.dir)
  if (!e) return f
  let resume: RackEntry['resume']
  if (evt.type === 'position') {
    if (!e.resume) return f
    resume = { ...e.resume, positionMs: evt.positionMs }
  } else {
    if (!evt.trackInfo) return f
    const path = evt.trackInfo.path
    const index = album.tracks.findIndex((t) => t.path === path)
    if (index < 0) return f
    resume = { index, path, positionMs: evt.positionMs }
  }
  return { ...f, entries: f.entries.map((x) => (x === e ? { ...x, resume } : x)) }
}

/** The commands for double-clicking a spine: a paused load, seek and play when there is a plan, else the engine's own track 1 autoplay. */
export function rackPlayCommands(dir: string, plan: { index: number; positionMs: number } | null): Command[] {
  if (!plan) return [{ v: 1, type: 'loadAlbum', path: dir }]
  return [
    { v: 1, type: 'loadAlbum', path: dir, index: plan.index, play: false },
    ...(plan.positionMs > 0 ? [{ v: 1, type: 'seek', positionMs: plan.positionMs } as const] : []),
    { v: 1, type: 'play' }
  ]
}
