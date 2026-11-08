import { PLAYLIST } from '@shared/layout'

type TextPx = { heading: number; row: number; lineHeight: number }

/** Design-px text sizes that show as `px` on screen once the composition is scaled by `scale`. */
export function textMetrics(scale: number, px: TextPx = PLAYLIST.TEXT_PX): { heading: number; row: number; pitch: number } {
  return { heading: px.heading / scale, row: px.row / scale, pitch: Math.round(px.row * px.lineHeight) / scale }
}
