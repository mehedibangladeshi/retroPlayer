import { useEffect, useState } from 'react'
import { RACK as R, type Rect } from '@shared/layout'
import { SHADE } from '@shared/shade'
import './RackView.css'

const urls = import.meta.glob<string>('@assets/rack/*.png', { query: '?url', import: 'default', eager: true })
const layerUrl = (file: string): string => {
  const hit = Object.entries(urls).find(([k]) => k.endsWith(`/${file.replace('rack/', '')}`))
  if (!hit) throw new Error(`missing artwork ${file}`)
  return hit[1]
}

/** Scale that fits the composition inside the viewport (letterboxed); shaded, the window is only the top bar. */
const compute = (shaded: boolean): { scale: number; left: number; top: number } => {
  if (shaded) return { scale: window.innerWidth / SHADE.rack.designW, left: 0, top: 0 }
  const scale = Math.min(window.innerWidth / R.WINDOW.w, window.innerHeight / R.WINDOW.h)
  return { scale, left: (window.innerWidth - R.WINDOW.w * scale) / 2, top: (window.innerHeight - R.WINDOW.h * scale) / 2 }
}

function useFitScale(shaded: boolean): { scale: number; left: number; top: number } {
  const [fit, setFit] = useState(() => compute(shaded))
  useEffect(() => {
    const onResize = (): void => setFit(compute(shaded))
    onResize()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [shaded])
  return fit
}

const box = (r: Rect): React.CSSProperties => ({ left: r.x, top: r.y, width: r.w, height: r.h })

/** The cassette rack window: its frame and empty shelf only for now (the cassette spines come later). */
export default function RackView() {
  const [shaded, setShaded] = useState(false)
  useEffect(() => window.retro.onShaded(setShaded), [])
  const fit = useFitScale(shaded)

  return (
    <div className="rk-stage">
      <div className="rk" style={{ width: R.WINDOW.w, height: R.WINDOW.h, left: fit.left, top: fit.top, transform: `scale(${fit.scale})` }}>
        {R.LAYERS.map((l) => <img key={l.id} className="rk-layer" src={layerUrl(l.file)} alt="" draggable={false} />)}
        {/* The only drag region: no children, ends left of the minimize button. */}
        <div className="rk-titlebar" style={{ width: R.MINIMIZE.x - 4, height: SHADE.rack.barH }} />
        <button type="button" className={`rk-chrome${shaded ? ' shaded' : ''}`} aria-label={shaded ? 'Restore' : 'Roll up'} style={box(R.MINIMIZE)} onClick={() => window.retro.toggleShade()} />
        <button type="button" className="rk-chrome" aria-label="Close cassette rack" style={box(R.CLOSE)} onClick={() => window.retro.closeWindow()} />
      </div>
    </div>
  )
}
