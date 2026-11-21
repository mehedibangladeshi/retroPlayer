import type { AlbumEditSave, AlbumEditState } from '../../../shared/api'
import type { CassetteDesign } from '../../../shared/cassettes'

export interface EditForm {
  design: CassetteDesign
  solid: boolean // spine is a solid colour instead of the cover crop
  spineColor: string
  ink: string | null // null = automatic
  text: string
  spineOffset: number
  token: string | null // latest picked cover, if any
}

export const initialForm = (s: AlbumEditState): EditForm => ({
  design: s.design ?? 'red',
  solid: !!s.custom.spineColor,
  spineColor: s.custom.spineColor ?? '#c0392b',
  ink: s.custom.ink ?? null,
  text: s.custom.text ?? '',
  spineOffset: s.custom.spineOffset ?? 0.5,
  token: null,
})

/** Never includes custom.cover: a new cover goes only as coverToken. */
export function toSave(s: AlbumEditState, f: EditForm): AlbumEditSave {
  const text = f.text.trim()
  const custom: AlbumEditSave['custom'] = { spineOffset: f.spineOffset }
  if (f.solid) custom.spineColor = f.spineColor
  if (f.ink) custom.ink = f.ink
  if (text) custom.text = text
  return { dir: s.dir, design: f.design, custom, ...(f.token ? { coverToken: f.token } : {}) }
}

/** Strip left edge in px -> offset 0..1 (0.5 when the strip fills the cover). */
export function offsetFromDrag(stripLeftPx: number, coverWidthPx: number, stripWidthPx: number): number {
  const range = coverWidthPx - stripWidthPx
  return range <= 0 ? 0.5 : Math.min(1, Math.max(0, stripLeftPx / range))
}

export const backgroundPosition = (offset: number): string => `${offset * 100}% 50%`
