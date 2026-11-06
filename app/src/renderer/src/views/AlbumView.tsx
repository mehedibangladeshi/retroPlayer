import { useEffect, useState } from 'react'
import { ALBUM as A, type Rect } from '@shared/layout'
import { SHADE } from '@shared/shade'
import { useEngine } from '../engine/useEngine'
import './AlbumView.css'

const urls = import.meta.glob<string>('@assets/album/*.png', { query: '?url', import: 'default', eager: true })
const layerUrl = (id: string): string => {
  const file = A.LAYERS.find((l) => l.id === id)!.file.replace('album/', '')
  const hit = Object.entries(urls).find(([k]) => k.endsWith(`/${file}`))
  if (!hit) throw new Error(`missing artwork ${file}`)
  return hit[1]
}

/** Scale that fits the composition inside the viewport (letterboxed). */
const compute = (shaded: boolean): { scale: number; left: number; top: number } => {
  // Shaded: the window is only the top bar, so scale by width alone and anchor top-left.
  if (shaded) return { scale: window.innerWidth / SHADE.album.designW, left: 0, top: 0 }
  const scale = Math.min(window.innerWidth / A.WINDOW.w, window.innerHeight / A.WINDOW.h)
  return { scale, left: (window.innerWidth - A.WINDOW.w * scale) / 2, top: (window.innerHeight - A.WINDOW.h * scale) / 2 }
}

function useFitScale(shaded: boolean): { scale: number; left: number; top: number } {
  const [fit, setFit] = useState(() => compute(shaded))
  useEffect(() => {
    const onResize = (): void => setFit(compute(shaded))
    onResize() // re-fit when the shade state flips
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [shaded])
  return fit
}

const box = (r: Rect): React.CSSProperties => ({ left: r.x, top: r.y, width: r.w, height: r.h })

export default function AlbumView() {
  const { artwork } = useEngine()
  const [shaded, setShaded] = useState(false)
  useEffect(() => window.retro.onShaded(setShaded), [])
  const fit = useFitScale(shaded)

  return (
    <div className="al-stage">
      <div className="al" style={{ width: A.WINDOW.w, height: A.WINDOW.h, left: fit.left, top: fit.top, transform: `scale(${fit.scale})` }}>
        <img className="al-layer" src={layerUrl('base')} alt="" draggable={false} />
        {artwork && <img className="al-cover" src={artwork} alt="Album cover" draggable={false} style={box(A.COVER)} />}
        <img className="al-layer" src={layerUrl('buttons')} alt="" draggable={false} />
        <img className="al-layer" src={layerUrl('top')} alt="" draggable={false} />
        {/* The only drag region: no children, ends left of the minimize button. */}
        <div className="al-titlebar" style={{ width: A.MINIMIZE.x - 4, height: SHADE.album.barH }} />
        <button type="button" className={`al-chrome${shaded ? ' shaded' : ''}`} aria-label={shaded ? 'Restore' : 'Roll up'} style={box(A.MINIMIZE)} onClick={() => window.retro.toggleShade()} />
        <button type="button" className="al-chrome" aria-label="Close album art" style={box(A.CLOSE)} onClick={() => window.retro.closeWindow()} />
      </div>
    </div>
  )
}
