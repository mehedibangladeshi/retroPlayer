// Free windows (playlist, rack): the art scales by the tighter side, and the composition (w x h, design px) grows to
// fill the window instead of letterboxing. Shaded (`barH` given), the window is only its top bar, which sets the scale.
export function stretchFit(innerW: number, innerH: number, designW: number, designH: number, barH?: number): { scale: number; w: number; h: number } {
  const scale = Math.min(innerW / designW, innerH / (barH ?? designH))
  return { scale, w: Math.max(designW, innerW / scale), h: barH === undefined ? Math.max(designH, innerH / scale) : designH }
}

export interface Slice { top: number; right: number; bottom: number; left: number }
// A full-window art layer as a nine-slice box (`slice` in design px, the art at `artScale`): corners stay as drawn,
// edges stretch along their length and the middle fills the rest, so a free window grows without distorting its details.
// It is laid out in whole screen pixels and scaled back by 1/scale inside the scaled view: fractional slice edges
// would show as faint seams.
export function nineSlice(url: string, slice: Slice, artScale: number, fit: { scale: number; w: number; h: number }): React.CSSProperties & { borderWidth: string; borderImage: string; width: number; height: number; transform: string } {
  const { top, right, bottom, left } = slice
  const px = [top, right, bottom, left].map((v) => `${Math.round(v * fit.scale)}px`).join(' ')
  return {
    position: 'absolute', left: 0, top: 0, width: Math.round(fit.w * fit.scale), height: Math.round(fit.h * fit.scale), transform: `scale(${1 / fit.scale})`, transformOrigin: '0 0',
    boxSizing: 'border-box', borderStyle: 'solid', borderColor: 'transparent', borderWidth: px,
    borderImage: `url("${url}") ${[top, right, bottom, left].map((v) => v * artScale).join(' ')} fill / ${px} stretch`
  }
}
