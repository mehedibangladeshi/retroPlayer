import type { AlbumTrack } from '@shared/protocol'

/** "01. Artist – Title"; the track's own artist wins over the album's. */
export function trackRowName(track: AlbumTrack, i: number, albumArtist: string | null): string {
  const artist = track.artist ?? albumArtist
  return `${String(i + 1).padStart(2, '0')}. ${artist ? `${artist} – ` : ''}${track.title}`
}

export function formatDuration(ms: number | null): string {
  if (ms == null) return ''
  const s = Math.floor(ms / 1000)
  const h = Math.floor(s / 3600)
  const ss = String(s % 60).padStart(2, '0')
  return h ? `${h}:${String(Math.floor(s / 60) % 60).padStart(2, '0')}:${ss}` : `${Math.floor(s / 60)}:${ss}`
}
