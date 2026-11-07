import { useEffect, useRef, useState } from 'react'
import { PLAYLIST as P, type Rect } from '@shared/layout'
import { playIndex, stepTrack } from '../engine/commands'
import { openAlbum, openFile } from '../input/openFile'
import { useEngine } from '../engine/useEngine'
import fontUrl from '@assets/playlist/fonts/AnotherTypewriter.ttf?url'
import defaultCover from '@assets/playlist/default-cover.svg?url'
import { SHADE } from '@shared/shade'
import { rowClickAction, rowKeyAction } from './rowKeys'
import './PlaylistView.css'

const urls = import.meta.glob<string>('@assets/playlist/*.png', { query: '?url', import: 'default', eager: true })
const layerUrl = (id: string): string => {
  const file = P.LAYERS.find((l) => l.id === id)!.file.replace('playlist/', '')
  const hit = Object.entries(urls).find(([k]) => k.endsWith(`/${file}`))
  if (!hit) throw new Error(`missing artwork ${file}`)
  return hit[1]
}
const layerRect = (id: string): Rect => P.LAYERS.find((l) => l.id === id)!.rect

const fmt = (ms: number | null): string => {
  if (ms == null) return ''
  const s = Math.floor(ms / 1000)
  const h = Math.floor(s / 3600)
  const ss = String(s % 60).padStart(2, '0')
  return h ? `${h}:${String(Math.floor(s / 60) % 60).padStart(2, '0')}:${ss}` : `${Math.floor(s / 60)}:${ss}`
}

const rectStyle = (r: Rect): React.CSSProperties => ({ left: r.x, top: r.y, width: r.w, height: r.h })

/** Scale that fits the fixed composition inside the viewport (letterboxed), tracked on resize. */
const compute = (shaded: boolean): { scale: number; left: number; top: number } => {
    // Shaded: the window is only the top bar, so scale by width alone and anchor top-left.
    if (shaded) return { scale: window.innerWidth / SHADE.playlist.designW, left: 0, top: 0 }
    const scale = Math.min(window.innerWidth / P.WINDOW.w, window.innerHeight / P.WINDOW.h)
    return { scale, left: (window.innerWidth - P.WINDOW.w * scale) / 2, top: (window.innerHeight - P.WINDOW.h * scale) / 2 }
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

export default function PlaylistView() {
  const { album, trackInfo } = useEngine()
  const [shaded, setShaded] = useState(false)
  useEffect(() => window.retro.onShaded(setShaded), [])
  const fit = useFitScale(shaded)
  const heading = album ? [album.artist, album.title].filter(Boolean).join(' – ') + (album.year ? ` (${album.year})` : '') : ''
  const ul = P.HEADING.underline
  // Selection is tied to the album it was made in, so a new album starts unselected.
  const [sel, setSel] = useState<{ album: unknown; i: number }>({ album: null, i: -1 })
  const selected = sel.album === album ? sel.i : -1
  const rowsRef = useRef<HTMLDivElement>(null)
  const count = album?.tracks.length ?? 0

  // Focus follows selection, which also scrolls the row into view.
  useEffect(() => {
    if (selected >= 0) (rowsRef.current?.querySelectorAll<HTMLElement>('.pl-row')[selected])?.focus()
  }, [selected])
  useEffect(() => {
    const down = (e: KeyboardEvent): void => {
      if (e.ctrlKey || e.metaKey || e.altKey) return
      const k = e.key.toLowerCase()
      if ((k === 'n' || k === 'p') && !e.repeat) stepTrack(k === 'n' ? 1 : -1)
      else if (k === 'arrowdown' || k === 'arrowup' || k === 'enter') {
        // Chrome buttons (Minimize/Close) and the empty-state buttons keep their native Enter/click behaviour.
        const active = document.activeElement as Element | null
        if (active?.classList.contains('pl-chrome') || active?.closest('.pl-empty')) return
        e.preventDefault() // also stops the native button click on a focused row
        const rows = Array.from(rowsRef.current?.querySelectorAll('.pl-row') ?? [])
        const f = rows.indexOf(document.activeElement as Element)
        const a = rowKeyAction(e.key, f >= 0 ? f : null, selected, count)
        if (a?.type === 'play' && !e.repeat) playIndex(a.index)
        else if (a?.type === 'select') setSel({ album, i: a.index })
      }
    }
    window.addEventListener('keydown', down)
    return () => window.removeEventListener('keydown', down)
  }, [album, count, selected])

  return (
    <div className="pl-stage">
      <style>{`@font-face { font-family: '${P.FONT_FAMILY}'; src: url(${fontUrl}) format('truetype'); }`}</style>
      <div className="pl" style={{ width: P.WINDOW.w, height: P.WINDOW.h, left: fit.left, top: fit.top, transform: `scale(${fit.scale})`, fontFamily: `'${P.FONT_FAMILY}', monospace` }}>
        {/* The only drag region: no children, ends 4px short of the Minimize button. */}
        <div className="pl-titlebar" style={{ width: P.MINIMIZE.x - 4, height: SHADE.playlist.barH }} />
        <img className="pl-layer" src={layerUrl('base')} alt="" draggable={false} style={rectStyle(layerRect('base'))} />
        <img className="pl-layer pl-cover" src={album?.cover ?? defaultCover} alt="" draggable={false} style={rectStyle(P.COVER)} />
        <img className="pl-layer" src={layerUrl('paper')} alt="" draggable={false} style={rectStyle(layerRect('paper'))} />

        {/* The "Track list" title, its dashes and the footer text are already painted in the base artwork. */}
        {/* The underline is a border so it follows the heading's width, starting at the art's underline x. */}
        <div
          className="pl-heading"
          style={{
            left: ul.x,
            top: P.HEADING.y - P.HEADING.fontSize,
            maxWidth: P.TEXT_AREA.x + P.TEXT_AREA.w - ul.x - 20,
            padding: `0 12px ${ul.y - P.HEADING.y}px ${P.HEADING.x - ul.x}px`,
            borderBottom: `${ul.h}px solid #111`,
            fontSize: P.HEADING.fontSize,
            lineHeight: `${P.HEADING.fontSize}px`
          }}
        >
          {heading}
        </div>

        <div className="pl-rows" ref={rowsRef} style={rectStyle(P.TEXT_AREA)}>
          {!album && (
            <div className="pl-empty">
              <p>No album loaded</p>
              <button type="button" onClick={() => void openFile()}>Open file…</button>
              <button type="button" onClick={() => void openAlbum()}>Open album…</button>
            </div>
          )}
          {/* y0 is a baseline; the baseline sits about 3/4 down a line box. */}
          {album && <div style={{ height: P.ROW.y0 - P.TEXT_AREA.y - P.ROW.pitch * 0.75 }} />}
          {album?.tracks.map((t, i) => {
            const artist = t.artist ?? album.artist
            return (
              <button
                key={t.path}
                type="button"
                className={`pl-row${t.path === trackInfo?.path ? ' current' : ''}${i === selected ? ' selected' : ''}`}
                style={{ height: P.ROW.pitch, lineHeight: `${P.ROW.pitch}px`, fontSize: P.ROW.fontSize, paddingLeft: P.ROW.x - P.TEXT_AREA.x }}
                onClick={(e) => {
                  setSel({ album, i })
                  // detail is 0 for a keyboard-fired click; Enter is handled by the keydown listener.
                  if (rowClickAction(e.detail, i)?.type === 'play') playIndex(i)
                }}
              >
                <span className="pl-name">
                  {String(i + 1).padStart(2, '0')}. {artist ? `${artist} – ` : ''}
                  {t.title}
                </span>
                <span className="pl-dur">{fmt(t.durationMs)}</span>
              </button>
            )
          })}
        </div>

        <button type="button" className={`pl-chrome${shaded ? ' shaded' : ''}`} aria-label={shaded ? 'Restore' : 'Roll up'} style={rectStyle(P.MINIMIZE)} onClick={() => window.retro.toggleShade()} />
        <button type="button" className="pl-chrome" aria-label="Close playlist" style={rectStyle(P.CLOSE)} onClick={() => window.retro.closeWindow()} />

        <img className="pl-layer" src={layerUrl('top')} alt="" draggable={false} style={rectStyle(layerRect('top'))} />
      </div>
    </div>
  )
}
