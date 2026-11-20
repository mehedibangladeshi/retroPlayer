export type SortMode = 'recent' | 'custom'
export interface Spine {
  dir: string // album folder = identity
  text: string // "Artist - Album (Year)"
  image: string | null // cropped strip, JPEG data URL; null = no cover
  bg: string // '#rrggbb'
  ink: '#000000' | '#ffffff'
}
export interface RackState {
  sort: SortMode
  spines: Spine[] // in display order
  nowPlaying: string | null // dir of the album in the deck, if it is in the rack
}
export const SPINE_ASPECT = 211 / 1527 // width / height
