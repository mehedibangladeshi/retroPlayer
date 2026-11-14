import type { Album, AlbumTrack } from '@shared/protocol'

/** True when the tracks' effective artists (own artist, else album's) differ: a mixtape. */
export function mixedArtists(album: Album): boolean {
  const artists = new Set(album.tracks.map((t) => t.artist ?? album.artist).filter((a) => a))
  return artists.size > 1
}

/** "01. Artist – Title" when showArtist, else "01. Title"; the track's own artist wins over the album's. */
export function trackRowName(track: AlbumTrack, i: number, showArtist: boolean, albumArtist: string | null): string {
  const artist = showArtist ? track.artist ?? albumArtist : null
  return `${String(i + 1).padStart(2, '0')}. ${artist ? `${artist} – ` : ''}${track.title}`
}

export function formatDuration(ms: number | null): string {
  if (ms == null) return ''
  const s = Math.floor(ms / 1000)
  const h = Math.floor(s / 3600)
  const ss = String(s % 60).padStart(2, '0')
  return h ? `${h}:${String(Math.floor(s / 60) % 60).padStart(2, '0')}:${ss}` : `${Math.floor(s / 60)}:${ss}`
}
