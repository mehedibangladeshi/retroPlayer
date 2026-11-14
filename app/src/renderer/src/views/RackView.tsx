import { useEffect, useState } from 'react'
import { nineSlice } from './stretchFit'
import { useStretchFit } from './useStretchFit'
import { RACK as R, type Rect } from '@shared/layout'
import { SHADE } from '@shared/shade'
import './RackView.css'

const urls = import.meta.glob<string>('@assets/rack/*.png', { query: '?url', import: 'default', eager: true })
const layerUrl = (file: string): string => {
  const hit = Object.entries(urls).find(([k]) => k.endsWith(`/${file.replace('rack/', '')}`))
  if (!hit) throw new Error(`missing artwork ${file}`)
  return hit[1]
}

const box = (r: Rect): React.CSSProperties => ({ left: r.x, top: r.y, width: r.w, height: r.h })
const right = (r: Rect, dw: number): Rect => ({ ...r, x: r.x + dw }) // anchored to the right edge

/** The cassette rack window: its frame and empty shelf only for now (the cassette spines come later). */
export default function RackView() {
  const [shaded, setShaded] = useState(false)
  useEffect(() => window.retro.onShaded(setShaded), [])
  // A free window: the composition grows to fill it, the art drawn nine-slice (see RACK.SLICE).
  const fit = useStretchFit(R.WINDOW.w, R.WINDOW.h, SHADE.rack.barH, shaded)
  const dw = fit.w - R.WINDOW.w

  return (
    <div className="rk-stage">
      <div className="rk" style={{ width: fit.w, height: fit.h, transform: `scale(${fit.scale})` }}>
        {R.LAYERS.map((l) => <div key={l.id} className="rk-layer" style={nineSlice(layerUrl(l.file), R.SLICE, R.ASSET_SCALE, fit)} />)}
        {/* The only drag region: no children, ends left of the minimize button. */}
        <div className="rk-titlebar" style={{ width: R.MINIMIZE.x + dw - 4, height: SHADE.rack.barH }} />
        <button type="button" className={`rk-chrome${shaded ? ' shaded' : ''}`} aria-label={shaded ? 'Restore' : 'Roll up'} style={box(right(R.MINIMIZE, dw))} onClick={() => window.retro.toggleShade()} />
        <button type="button" className="rk-chrome" aria-label="Close cassette rack" style={box(right(R.CLOSE, dw))} onClick={() => window.retro.closeWindow()} />
      </div>
    </div>
  )
}
