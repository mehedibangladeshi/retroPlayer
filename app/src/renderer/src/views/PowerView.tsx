import { useEffect, useState } from 'react'
import { POWER as R, type Rect } from '@shared/layout'
import { SHADE } from '@shared/shade'
import './PowerView.css'

const urls = import.meta.glob<string>('@assets/power/*.png', { query: '?url', import: 'default', eager: true })
const layerUrl = (file: string): string => {
  const hit = Object.entries(urls).find(([k]) => k.endsWith(`/${file.replace('power/', '')}`))
  if (!hit) throw new Error(`missing artwork ${file}`)
  return hit[1]
}

/** Scale that fits the composition inside the viewport (letterboxed); shaded, the window is only the top bar. */
const compute = (shaded: boolean): { scale: number; left: number; top: number } => {
  if (shaded) return { scale: window.innerWidth / SHADE.power.designW, left: 0, top: 0 }
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

/** The power deck window: its artwork only for now (knob, seek bar, visualizer, switches and buttons have no function yet). */
export default function PowerView() {
  const [shaded, setShaded] = useState(false)
  useEffect(() => window.retro.onShaded(setShaded), [])
  const fit = useFitScale(shaded)

  return (
    <div className="pd-stage">
      <div className="pd" style={{ width: R.WINDOW.w, height: R.WINDOW.h, left: fit.left, top: fit.top, transform: `scale(${fit.scale})` }}>
        {R.LAYERS.map((l) => <img key={l.id} className="pd-layer" src={layerUrl(l.file)} alt="" draggable={false} />)}
        {/* The only drag region: no children, ends left of the minimize button. */}
        <div className="pd-titlebar" style={{ width: R.MINIMIZE.x - 4, height: SHADE.power.barH }} />
        <button type="button" className={`pd-chrome${shaded ? ' shaded' : ''}`} aria-label={shaded ? 'Restore' : 'Roll up'} style={box(R.MINIMIZE)} onClick={() => window.retro.toggleShade()} />
        <button type="button" className="pd-chrome" aria-label="Close power deck" style={box(R.CLOSE)} onClick={() => window.retro.closeWindow()} />
      </div>
    </div>
  )
}
