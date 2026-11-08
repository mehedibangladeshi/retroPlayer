import { PROTOCOL_VERSION, type Album, type Command, type EngineEvent } from '@shared/protocol'

/** The last session: the track, its album (null for a single file) and where playback stood. Saved in settings.json. */
export interface Session { path: string; album: string | null; index: number; positionMs: number }

/** Folds an engine event into the session. `album` is the latest `playlist` album, which arrives before its tracks' states. */
export function nextSession(s: Session | undefined, album: Album | null, evt: EngineEvent): Session | undefined {
  if (evt.type === 'position') return s && { ...s, positionMs: evt.positionMs }
  // No track (startup, engine restart): keep what was saved so it can still be restored.
  if (evt.type !== 'state' || !evt.trackInfo) return s
  const path = evt.trackInfo.path
  const index = album ? album.tracks.findIndex((t) => t.path === path) : -1
  return album && index >= 0 ? { path, album: album.dir, index, positionMs: evt.positionMs } : { path, album: null, index: 0, positionMs: evt.positionMs }
}

/** Commands that put the engine back on the saved track and position, without playing. */
export function restoreCommands(s: Session): Command[] {
  const v = PROTOCOL_VERSION
  const load: Command = s.album ? { v, type: 'loadAlbum', path: s.album, index: s.index, play: false } : { v, type: 'load', path: s.path }
  return s.positionMs > 0 ? [load, { v, type: 'seek', positionMs: s.positionMs }] : [load]
}

/**
 * Restore states still to come: each restore command yields one state with a track (the load's at 0:00, then the
 * seek's). Until they are in, the session must not be saved, or a quit mid-restore would keep 0:00. An error ends it.
 */
export function restoreStep(left: number, evt: EngineEvent): number {
  if (left === 0 || evt.type === 'error') return 0
  return evt.type === 'state' && evt.trackInfo ? left - 1 : left
}

// settings.json can be hand-edited or corrupt: accept a session only if every field is sane.
export function parseSession(raw: unknown): Session | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined
  const r = raw as Record<string, unknown>
  const ok =
    typeof r.path === 'string' && r.path.length > 0 &&
    (r.album === null || (typeof r.album === 'string' && r.album.length > 0)) &&
    Number.isInteger(r.index) && (r.index as number) >= 0 &&
    typeof r.positionMs === 'number' && Number.isFinite(r.positionMs) && r.positionMs >= 0
  return ok ? { path: r.path as string, album: r.album as string | null, index: r.index as number, positionMs: r.positionMs as number } : undefined
}
