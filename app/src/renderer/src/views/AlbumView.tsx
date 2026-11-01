import { useEffect, useState } from 'react'
import { PLAYLIST as P, type Rect } from '@shared/layout'
import { useEngine } from '../engine/useEngine'
import topUrl from '@assets/playlist/playlist-top.png?url'
import './AlbumView.css'

const SIZE = 600
const RIGHT_MARGIN = P.WINDOW.w - (P.CLOSE.x + P.CLOSE.w) // same gap to the edge as in the playlist
const GAP = P.CLOSE.x - (P.MINIMIZE.x + P.MINIMIZE.w)
const CLOSE_X = SIZE - RIGHT_MARGIN - P.CLOSE.w
const MINIMIZE_X = CLOSE_X - GAP - P.MINIMIZE.w

/** Scale that fits the square composition inside the viewport (letterboxed). */
function useFitScale(): { scale: number; left: number; top: number } {
  const compute = () => {
    const scale = Math.min(window.innerWidth, window.innerHeight) / SIZE
    return { scale, left: (window.innerWidth - SIZE * scale) / 2, top: (window.innerHeight - SIZE * scale) / 2 }
  }
  const [fit, setFit] = useState(compute)
  useEffect(() => {
    const onResize = (): void => setFit(compute())
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  return fit
}

// Each button crops its art out of the playlist top layer shown at 1x.
const chrome = (r: Rect, left: number): React.CSSProperties => ({
  left,
  top: r.y,
  width: r.w,
  height: r.h,
  backgroundImage: `url(${topUrl})`,
  backgroundSize: `${P.WINDOW.w}px ${P.WINDOW.h}px`,
  backgroundPosition: `${-r.x}px ${-r.y}px`
})

export default function AlbumView() {
  const { artwork } = useEngine()
  const fit = useFitScale()

  return (
    <div className="al-stage">
      <div className="al" style={{ width: SIZE, height: SIZE, left: fit.left, top: fit.top, transform: `scale(${fit.scale})` }}>
        <div className="al-inset">{artwork && <img src={artwork} alt="Album cover" draggable={false} />}</div>
        <button type="button" className="al-chrome" aria-label="Minimize" style={chrome(P.MINIMIZE, MINIMIZE_X)} onClick={() => window.retro.minimizeWindow()} />
        <button type="button" className="al-chrome" aria-label="Close album art" style={chrome(P.CLOSE, CLOSE_X)} onClick={() => window.retro.closeWindow()} />
      </div>
    </div>
  )
}
