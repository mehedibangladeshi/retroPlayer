import { useEffect, useRef, useState } from 'react'
import { PLAYLIST as P, type Rect } from '@shared/layout'
import { playIndex, stepTrack } from '../engine/commands'
import { openAlbum, openFile } from '../input/openFile'
import { useEngine } from '../engine/useEngine'
import fontUrl from '@assets/playlist/fonts/Montserrat-VariableFont_wght.ttf?url'
import defaultCover from '@assets/playlist/default-cover.svg?url'
import { SHADE } from '@shared/shade'
import { rowClickAction, rowKeyAction } from './rowKeys'
import { MARQUEE_DELAY_MS, marquee } from './marquee'
import { textMetrics } from './playlistText'
import TrackRows from './TrackRows'
import TitleText from './TitleText'
import { nineSlice } from './stretchFit'
import { useStretchFit } from './useStretchFit'
import './PlaylistView.css'

const urls = import.meta.glob<string>('@assets/playlist/*.png', { query: '?url', import: 'default', eager: true })
const layerUrl = (id: string): string => {
  const file = P.LAYERS.find((l) => l.id === id)!.file.replace('playlist/', '')
  const hit = Object.entries(urls).find(([k]) => k.endsWith(`/${file}`))
  if (!hit) throw new Error(`missing artwork ${file}`)
  return hit[1]
}

const rectStyle = (r: Rect): React.CSSProperties => ({ left: r.x, top: r.y, width: r.w, height: r.h })
// A free window grows by dw x dh design px: areas grow with it, the buttons stay at the right edge.
const grow = (r: Rect, dw: number, dh: number): Rect => ({ ...r, w: r.w + dw, h: r.h + dh })
const right = (r: Rect, dw: number): Rect => ({ ...r, x: r.x + dw })

// The song list scrolls below the album heading, so the heading stays on top.
const LIST: Rect = { ...P.TEXT_AREA, y: P.LIST_TOP, h: P.TEXT_AREA.y + P.TEXT_AREA.h - P.LIST_TOP }

export default function PlaylistView() {
  const { album, trackInfo } = useEngine()
  const [shaded, setShaded] = useState(false)
  useEffect(() => window.retro.onShaded(setShaded), [])
  // A free window: the composition grows to fill it, the art drawn nine-slice (see PLAYLIST.SLICE).
  const fit = useStretchFit(P.WINDOW.w, P.WINDOW.h, SHADE.playlist.barH, shaded)
  const dw = fit.w - P.WINDOW.w
  const dh = fit.h - P.WINDOW.h
  const slice = (id: string): React.CSSProperties => nineSlice(layerUrl(id), P.SLICE, P.ASSET_SCALE, fit)
  // Text keeps its screen size while the window (and so the artwork) is resized.
  const text = textMetrics(fit.scale)
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
  // A selected name that is cut off scrolls to its end and back, starting 400 ms after selection.
  useEffect(() => {
    const name = rowsRef.current?.querySelectorAll<HTMLElement>('.pl-name')[selected]
    if (!name) return
    const t = setTimeout(() => {
      // Measured in design px; timed in screen px so the speed is the same at every window size.
      const m = marquee(name.scrollWidth * fit.scale, name.clientWidth * fit.scale)
      if (!m) return
      name.style.setProperty('--marquee-shift', `${m.shift / fit.scale}px`)
      name.style.setProperty('--marquee-ms', `${m.durationMs}ms`)
      name.classList.add('marquee')
    }, MARQUEE_DELAY_MS)
    return () => {
      clearTimeout(t)
      name.classList.remove('marquee')
    }
  }, [selected, album, fit.scale])
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
      <style>{`@font-face { font-family: '${P.FONT_FAMILY}'; src: url(${fontUrl}) format('truetype'); font-weight: 100 900; }`}</style>
      <div className="pl" style={{ width: fit.w, height: fit.h, transform: `scale(${fit.scale})`, fontFamily: `'${P.FONT_FAMILY}', sans-serif` }}>
        {/* The only drag region: no children, ends 4px short of the Minimize button. */}
        <div className="pl-titlebar" style={{ width: P.MINIMIZE.x + dw - 4, height: SHADE.playlist.barH }} />
        <div className="pl-layer" style={slice('base')} />
        <TitleText title={P.TITLE} />
        <img className="pl-layer pl-cover" src={album?.cover ?? defaultCover} alt="" draggable={false} style={rectStyle(grow(P.COVER, dw, dh))} />
        <div className="pl-layer" style={slice('paper')} />

        {/* The title's dashes and the footer text are painted in the base artwork; the title is TitleText above. */}
        {/* The underline is a border so it follows the heading's width, starting at the art's underline x. */}
        <div
          className="pl-heading"
          style={{
            left: ul.x,
            top: P.HEADING.y - text.heading,
            maxWidth: P.TEXT_AREA.x + P.TEXT_AREA.w + dw - ul.x - 20,
            padding: `0 12px ${ul.y - P.HEADING.y}px ${P.HEADING.x - ul.x}px`,
            borderBottom: `${ul.h}px solid #111`,
            fontSize: text.heading,
            lineHeight: `${text.heading}px`
          }}
        >
          {heading}
        </div>

        <div className="pl-rows" ref={rowsRef} style={rectStyle(grow(LIST, dw, dh))}>
          {!album && (
            <div className="pl-empty">
              <p>No album loaded</p>
              <button type="button" onClick={() => void openFile()}>Open file…</button>
              <button type="button" onClick={() => void openAlbum()}>Open album…</button>
            </div>
          )}
          {album && (
            <TrackRows
              album={album}
              currentPath={trackInfo?.path}
              selected={selected}
              pitch={text.pitch}
              rowFont={text.row}
              padLeft={P.ROW.x - P.TEXT_AREA.x}
              onRowClick={(e, i) => {
                setSel({ album, i })
                // detail is 0 for a keyboard-fired click; Enter is handled by the keydown listener.
                if (rowClickAction(e.detail, i)?.type === 'play') playIndex(i)
              }}
            />
          )}
        </div>

        <button type="button" className={`pl-chrome${shaded ? ' shaded' : ''}`} aria-label={shaded ? 'Restore' : 'Roll up'} style={rectStyle(right(P.MINIMIZE, dw))} onClick={() => window.retro.toggleShade()} />
        <button type="button" className="pl-chrome" aria-label="Close playlist" style={rectStyle(right(P.CLOSE, dw))} onClick={() => window.retro.closeWindow()} />

        <div className="pl-layer" style={slice('top')} />
      </div>
    </div>
  )
}
