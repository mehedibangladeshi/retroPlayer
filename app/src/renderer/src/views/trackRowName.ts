import type { AlbumTrack } from '@shared/protocol'

/** "01. Title": the number is the track's place in the album; the artist is never shown. */
export function trackRowName(track: AlbumTrack, i: number): string {
  return `${String(i + 1).padStart(2, '0')}. ${track.title}`
}

export function formatDuration(ms: number | null): string {
  if (ms == null) return ''
  const s = Math.floor(ms / 1000)
  const h = Math.floor(s / 3600)
  const ss = String(s % 60).padStart(2, '0')
  return h ? `${h}:${String(Math.floor(s / 60) % 60).padStart(2, '0')}:${ss}` : `${Math.floor(s / 60)}:${ss}`
}
