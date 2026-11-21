// Pure logic of the Album Edit dialog (no electron): the save check at the renderer trust boundary, the custom
// cover's file name, the state sent to the dialog and where the dialog opens.
import { createHash } from 'node:crypto'
import { isCassetteDesign, type CassetteDesign } from '@shared/cassettes'
import type { AlbumCustom } from '@shared/rack'
import type { Album } from '@shared/protocol'
import type { AlbumEditState } from '@shared/api'
import type { RackEntry } from './rack'
import type { Rect } from './dock'
// rack.ts helpers are passed in (index.ts passes the real ones): Node's test runner cannot resolve this module's
// extensionless relative imports at runtime, only type imports, which are erased.
type ParseCustom = (v: unknown) => AlbumCustom | undefined
type SpineText = (a: { dir: string; title: string | null; artist: string | null; year: string | null }) => string

// Fixed dialog size in DIP, after the reference layout (assets/ui/edit_window): preview left, options right, Cancel/Save below.
export const EDIT_SIZE = { width: 760, height: 532 }

/** The image the user picked and main holds until a save names it by `token` (one at a time: a new pick replaces it). */
export interface PendingCover { token: string; jpeg: Uint8Array }

/** The custom cover's file name inside userData/covers: content-addressed, so the same image is stored once. */
export const coverName = (jpeg: Uint8Array): string => createHash('sha256').update(jpeg).digest('hex').slice(0, 32) + '.jpg'

/** A picked image too big to accept (checked before it is resized or encoded). */
export const coverTooLarge = (s: { width: number; height: number }): boolean => s.width > 10000 || s.height > 10000

export interface SavePlan { dir: string; design: CassetteDesign; custom: AlbumCustom; write?: { name: string; jpeg: Uint8Array } }

/**
 * Checks an untrusted save from the dialog. The cover file name is never taken from the renderer: it is the entry's
 * existing one, or the pending pick's (then `write` asks main to store those bytes). Throws on anything invalid, or when the save is not for `editing` (the dialog's open target).
 */
export function planSave(v: unknown, entries: RackEntry[], pending: PendingCover | null, parseAlbumCustom: ParseCustom, editing: string | null): SavePlan {
  if (!v || typeof v !== 'object') throw new Error('invalid save')
  const o = v as Record<string, unknown>
  if (editing === null || o.dir !== editing) throw new Error('not the album being edited')
  const entry = typeof o.dir === 'string' ? entries.find((e) => e.dir === o.dir) : undefined
  if (!entry) throw new Error('album not in the rack')
  if (!isCassetteDesign(o.design)) throw new Error('invalid cassette design')
  const custom = { ...parseAlbumCustom(o.custom) }
  delete custom.cover // never from the renderer
  if (o.coverToken === undefined) {
    const cover = entry.custom?.cover
    return { dir: entry.dir, design: o.design, custom: cover ? { ...custom, cover } : custom }
  }
  if (!pending || o.coverToken !== pending.token) throw new Error('unknown cover')
  const name = coverName(pending.jpeg)
  return { dir: entry.dir, design: o.design, custom: { ...custom, cover: name }, write: { name, jpeg: pending.jpeg } }
}

/** What the dialog shows for one album; `album` is null when the folder could not be read. */
export function editState(entry: RackEntry, album: Album | null, customCover: string | null, spineText: SpineText): AlbumEditState {
  return {
    dir: entry.dir,
    defaultText: spineText(album ?? { dir: entry.dir, title: null, artist: null, year: null }),
    cover: customCover ?? album?.cover ?? null,
    design: entry.design ?? null,
    custom: entry.custom ?? {}
  }
}

/** Centred over the player, kept on its display's work area. */
export function editBounds(parent: Rect, area: Rect): Rect {
  const x = Math.round(parent.x + (parent.width - EDIT_SIZE.width) / 2)
  const y = Math.round(parent.y + (parent.height - EDIT_SIZE.height) / 2)
  return { x: Math.max(area.x, Math.min(x, area.x + area.width - EDIT_SIZE.width)), y: Math.max(area.y, Math.min(y, area.y + area.height - EDIT_SIZE.height)), ...EDIT_SIZE }
}
