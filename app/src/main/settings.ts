import { readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'

export interface WindowState { x: number; y: number; width: number; height: number; fullScreen: boolean }
export interface Settings { lastOpenDir?: string; window?: WindowState; playlistWindow?: WindowState; albumWindow?: WindowState }

let cache: Settings | null = null

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

function settingsPath(): string {
  return join(app.getPath('userData'), 'settings.json')
}

function parseWindow(v: unknown): WindowState | undefined {
  const w = v as Record<string, unknown> | null | undefined
  if (typeof w === 'object' && w !== null && isNum(w.x) && isNum(w.y) && isNum(w.width) && isNum(w.height) && w.width > 0 && w.height > 0) {
    return { x: w.x, y: w.y, width: w.width, height: w.height, fullScreen: w.fullScreen === true }
  }
  return undefined
}

// Validate field by field so a hand-edited or corrupt file can never put bad values in the window code.
function parse(raw: unknown): Settings {
  const out: Settings = {}
  if (typeof raw !== 'object' || raw === null) return out
  const r = raw as Record<string, unknown>
  if (typeof r.lastOpenDir === 'string' && r.lastOpenDir) out.lastOpenDir = r.lastOpenDir
  const win = parseWindow(r.window)
  if (win) out.window = win
  const pl = parseWindow(r.playlistWindow)
  if (pl) out.playlistWindow = pl
  const al = parseWindow(r.albumWindow)
  if (al) out.albumWindow = al
  return out
}

export function loadSettings(): Settings {
  if (cache) return cache
  try {
    cache = parse(JSON.parse(readFileSync(settingsPath(), 'utf8')))
  } catch {
    cache = {}
  }
  return cache
}

export function saveSettings(patch: Partial<Settings>): void {
  cache = { ...loadSettings(), ...patch }
  try {
    const file = settingsPath()
    const tmp = file + '.tmp'
    writeFileSync(tmp, JSON.stringify(cache, null, 2))
    renameSync(tmp, file) // atomic replace: a crash mid-write never leaves a half-written settings.json
  } catch (err) {
    console.warn('[main] could not save settings', err)
  }
}
