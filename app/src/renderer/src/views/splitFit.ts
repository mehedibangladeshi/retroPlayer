import { CHROME_SCALE, chromeBarPx } from '@shared/chrome'

// Side windows with a fixed title bar: the composition is split at design y = barH. The bar keeps one on-screen size
// (chromeBarPx); the body (design y >= barH) scales by the tighter side and sits directly under it.
export function splitFit(winW: number, winH: number, designW: number, designH: number, barH: number): { barPx: number; scale: number; left: number; top: number } {
  const barPx = Math.round(chromeBarPx(barH))
  // The main process holds the aspect so the width alone fits; min() guards a 1-2 px rounding mismatch (letterbox, never overflow).
  const scale = Math.min(winW / designW, (winH - barPx) / (designH - barH))
  return { barPx, scale, left: (winW - designW * scale) / 2, top: barPx }
}

// The bar art (design rows 0..barH of a 2x layer) as a nine-slice: left and right caps stay at CHROME_SCALE, the middle
// stretches. The bottom slice takes the rest of the image and its border width is 0, so only the bar is drawn.
export function barSlice(url: string, designH: number, barH: number, capL: number, capR: number, artScale: number): React.CSSProperties & { borderWidth: string; borderImage: string } {
  const px = (v: number): number => Math.round(v * CHROME_SCALE)
  const bar = px(barH)
  return {
    position: 'absolute', left: 0, top: 0, width: '100%', height: bar, boxSizing: 'border-box', borderStyle: 'solid', borderColor: 'transparent',
    borderWidth: `${bar}px ${px(capR)}px 0px ${px(capL)}px`,
    borderImage: `url("${url}") ${barH * artScale} ${capR * artScale} ${(designH - barH) * artScale} ${capL * artScale} fill / ${bar}px ${px(capR)}px 0px ${px(capL)}px stretch`
  }
}

// A left-anchored (not stretched) full-size layer drawn in the bar at CHROME_SCALE: the layer is one <img> of the whole
// art at its scaled size, clipped to the bar. An <img> (not a CSS background) so the browser downsamples it well; the
// 2x art thin strokes smear otherwise.
export function titleLayer(designW: number, designH: number, barH: number): { img: { width: number; height: number; left: number; top: number }; clip: { height: number } } {
  return { img: { width: designW * CHROME_SCALE, height: designH * CHROME_SCALE, left: 0, top: 0 }, clip: { height: Math.round(chromeBarPx(barH)) } }
}
