import { useEffect, useState } from 'react'
import { ALBUM as A, type Rect } from '@shared/layout'
import { CHROME_SCALE } from '@shared/chrome'
import { SHADE } from '@shared/shade'
import { barSlice, splitFit } from './splitFit'
import { useEngine } from '../engine/useEngine'
import './AlbumView.css'

const urls = import.meta.glob<string>('@assets/album/*.png', { query: '?url', import: 'default', eager: true })
const layerUrl = (id: string): string => {
  const file = A.LAYERS.find((l) => l.id === id)!.file.replace('album/', '')
  const hit = Object.entries(urls).find(([k]) => k.endsWith(`/${file}`))
  if (!hit) throw new Error(`missing artwork ${file}`)
  return hit[1]
}

const CAP_L = 40
const CAP_R = 90 // holds the baked minimize and close (design x 852..915 of 937)
const EDGE = 40 // side and bottom border art, narrower than the glass frame (starts at x 70)
const px = (v: number): number => Math.round(v * CHROME_SCALE)

const measure = (shaded: boolean): { w: number; h: number } => ({ w: window.innerWidth, h: shaded ? px(SHADE.album.barH) : window.innerHeight })

function useWindowSize(shaded: boolean): { w: number; h: number } {
  const [size, setSize] = useState(() => measure(shaded))
  useEffect(() => {
    const onResize = (): void => setSize(measure(shaded))
    onResize() // re-measure when the shade state flips
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [shaded])
  return size
}

const box = (r: Rect): React.CSSProperties => ({ left: r.x, top: r.y, width: r.w, height: r.h })

export default function AlbumView() {
  const { artwork } = useEngine()
  const [shaded, setShaded] = useState(false)
  useEffect(() => window.retro.onShaded(setShaded), [])
  const win = useWindowSize(shaded)
  const barH = SHADE.album.barH
  const fit = splitFit(win.w, win.h, A.WINDOW.w, A.WINDOW.h, barH)
  const top = layerUrl('top')
  // Bar space: fixed size, hit boxes anchored to the right edge like the baked icons.
  const bar = (r: Rect): React.CSSProperties => ({ left: win.w - (A.WINDOW.w - r.x) * CHROME_SCALE, top: r.y * CHROME_SCALE, width: r.w * CHROME_SCALE, height: r.h * CHROME_SCALE })

  return (
    <div className="al-stage">
      <div className="al-bar" style={{ height: fit.barPx }}>
        <div style={barSlice(layerUrl('base'), A.WINDOW.h, barH, CAP_L, CAP_R, A.ASSET_SCALE)} />
        <div style={barSlice(top, A.WINDOW.h, barH, CAP_L, CAP_R, A.ASSET_SCALE)} />
        {/* The only drag region: no children, ends left of the minimize button. */}
        <div className="al-titlebar" style={{ width: win.w - (A.WINDOW.w - A.MINIMIZE.x) * CHROME_SCALE - 4, height: fit.barPx }} />
        <button type="button" className={`al-chrome${shaded ? ' shaded' : ''}`} aria-label={shaded ? 'Restore' : 'Roll up'} style={bar(A.MINIMIZE)} onClick={() => window.retro.toggleShade()} />
        <button type="button" className="al-chrome" aria-label="Close album art" style={bar(A.CLOSE)} onClick={() => window.retro.closeWindow()} />
      </div>
      {!shaded && (
        <div className="al-body" style={{ top: fit.top, height: win.h - fit.top }}>
          <div className="al" style={{ width: A.WINDOW.w, height: A.WINDOW.h, left: fit.left, top: -barH * fit.scale, transform: `scale(${fit.scale})` }}>
            <img className="al-layer" src={layerUrl('base')} alt="" draggable={false} />
            {artwork && <img className="al-cover" src={artwork} alt="Album cover" draggable={false} style={box(A.COVER)} />}
            <img className="al-layer" src={layerUrl('buttons')} alt="" draggable={false} />
            {/* Only the glass frame scales with the body; the outline is drawn below at a fixed width. */}
            <img className="al-layer" src={top} alt="" draggable={false} style={{ clipPath: `inset(0 ${EDGE}px ${EDGE}px ${EDGE}px)` }} />
          </div>
          <div className="al-edge" style={{
            borderWidth: `0 ${px(EDGE)}px ${px(EDGE)}px ${px(EDGE)}px`,
            borderImage: `url("${top}") ${barH * A.ASSET_SCALE} ${EDGE * A.ASSET_SCALE} ${EDGE * A.ASSET_SCALE} ${EDGE * A.ASSET_SCALE} / 0 ${px(EDGE)}px ${px(EDGE)}px ${px(EDGE)}px stretch`
          }} />
        </div>
      )}
    </div>
  )
}
