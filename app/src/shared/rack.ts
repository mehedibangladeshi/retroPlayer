import type { CassetteDesign } from './cassettes'

export type SortMode = 'recent' | 'custom'
export interface Spine {
  dir: string // album folder = identity
  text: string // "Artist - Album (Year)"
  image: string | null // cropped strip, JPEG data URL; null = no cover
  bg: string // '#rrggbb'
  ink: string // '#rrggbb'
  design: CassetteDesign | null // cassette artwork for this album; null = not assigned yet
}
/** User overrides for one album; every field optional. */
export interface AlbumCustom {
  cover?: string // file name inside userData/covers/ (never a path)
  spineOffset?: number // 0..1; 0.5 = centred
  spineColor?: string // '#rrggbb': solid spine, no image
  ink?: string // '#rrggbb' text colour
  text?: string // spine text override
}
export interface RackState {
  sort: SortMode
  spines: Spine[] // in display order
  nowPlaying: string | null // dir of the album in the deck, if it is in the rack
}
export const SPINE_ASPECT = 211 / 1527 // width / height
