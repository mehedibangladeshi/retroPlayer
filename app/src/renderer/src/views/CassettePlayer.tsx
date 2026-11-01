import { useCallback, useEffect, useRef, useState } from 'react'
import { BUTTONS, CASSETTE, CHROME, CHROME_ART, LABEL, LAYERS, REELS, WINDOW, type ButtonId, type LayerId, type Rect } from '@shared/layout'
import { pressPause, pressPlay, pressStop } from '../engine/commands'
import { clearError } from '../engine/store'
import { useDisplayPosition, useEngine } from '../engine/useEngine'
import { ERROR_MESSAGES, formatTime } from '../format'
import { openAlbum, openFile } from '../input/openFile'
import { useFileDrop } from '../input/useFileDrop'
import { useKeyboard } from '../input/useKeyboard'
import { useSeekHold } from '../input/useSeekHold'
import { transportDisabled } from './transport'
import { useReels } from './useReels'
import './CassettePlayer.css'

const urls = import.meta.glob<string>('@assets/png/*.png', { query: '?url', import: 'default', eager: true })
const layerUrl = (id: LayerId): string => {
  const file = LAYERS.find((l) => l.id === id)!.file
  const hit = Object.entries(urls).find(([k]) => k.endsWith(`/${file}`))
  if (!hit) throw new Error(`missing artwork for ${id}`)
  return hit[1]
}

const fileUrl = (file: string): string => {
  const hit = Object.entries(urls).find(([k]) => k.endsWith(`/${file}`))
  if (!hit) throw new Error(`missing artwork ${file}`)
  return hit[1]
}

/** Scale that fits the fixed composition inside the viewport (letterboxed), tracked on resize. */
function useFitScale(): { scale: number; left: number; top: number } {
  const compute = () => {
    const scale = Math.min(window.innerWidth / WINDOW.width, window.innerHeight / WINDOW.height)
    return { scale, left: (window.innerWidth - WINDOW.width * scale) / 2, top: (window.innerHeight - WINDOW.height * scale) / 2 }
  }
  const [fit, setFit] = useState(compute)
  useEffect(() => {
    const onResize = (): void => setFit(compute())
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  return fit
}

const rectStyle = (r: Rect): React.CSSProperties => ({ left: r.x, top: r.y, width: r.w, height: r.h })
const TOAST_INSET = 40
// Popover sits at the bottom centre of the cassette window, above the "click to open" hint.
const MENU = { x: CASSETTE.x + CASSETTE.w / 2 - 70, y: CASSETTE.y + CASSETTE.h - 96 }
const PROMPT = 'CLICK OR DROP A FILE'
const STATIC_LAYERS: LayerId[] = ['bodyBase', 'cassetteBase', 'cassetteMid']
const TOP_LAYERS: LayerId[] = ['bodyTopCover', 'bodyBottom']
const layerRect = (id: LayerId): Rect => LAYERS.find((l) => l.id === id)!.rect

function Layer({ id }: { id: LayerId }) {
  return <img className="layer" src={layerUrl(id)} alt="" draggable={false} style={rectStyle(layerRect(id))} />
}

function Reel({ circle, reelRef }: { circle: { cx: number; cy: number; r: number }; reelRef: React.RefObject<HTMLImageElement | null> }) {
  const cx = circle.cx - CASSETTE.x
  const cy = circle.cy - CASSETTE.y
  return (
    <img
      ref={reelRef}
      className="layer reel"
      src={layerUrl('cassetteReel')}
      alt=""
      draggable={false}
      style={{ ...rectStyle(CASSETTE), clipPath: `circle(${circle.r}px at ${cx}px ${cy}px)`, transformOrigin: `${cx}px ${cy}px` }}
    />
  )
}

export default function CassettePlayer() {
  const [menuOpen, setMenuOpen] = useState(false)
  const openBtn = useRef<HTMLButtonElement>(null)
  // Ctrl/Cmd+O also closes the menu. Stable so useKeyboard's listener is not re-attached on every render.
  const requestOpen = useCallback((): void => {
    setMenuOpen(false)
    void openFile()
  }, [])
  const { status, durationMs, trackInfo, error } = useEngine()
  const position = useDisplayPosition()
  const seek = useSeekHold()
  useKeyboard(seek, requestOpen)
  const dragging = useFileDrop()
  const off = transportDisabled(status)
  const fit = useFitScale()
  const loaded = status !== 'empty'
  const title = trackInfo?.title || PROMPT

  // Close on any press outside the menu (the Open button toggles it itself) or Escape.
  useEffect(() => {
    if (!menuOpen) return
    const away = (e: MouseEvent): void => {
      if (!(e.target as Element).closest('.cp-menu, .cp-open')) setMenuOpen(false)
    }
    const esc = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return
      setMenuOpen(false)
      openBtn.current?.focus()
    }
    window.addEventListener('mousedown', away)
    window.addEventListener('keydown', esc)
    return () => {
      window.removeEventListener('mousedown', away)
      window.removeEventListener('keydown', esc)
    }
  }, [menuOpen])

  const choose = (run: () => Promise<void>): void => {
    setMenuOpen(false)
    openBtn.current?.focus()
    void run()
  }

  // ArrowUp/ArrowDown move focus between the menu items (wraps at both ends).
  const menuKeys = (e: React.KeyboardEvent<HTMLDivElement>): void => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    e.preventDefault()
    const items = Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'))
    const i = items.indexOf(document.activeElement as HTMLButtonElement)
    const step = e.key === 'ArrowDown' ? 1 : -1
    items[i < 0 ? 0 : (i + step + items.length) % items.length].focus()
  }

  const reels = useReels(status, seek.held)

  const buttonProps: Record<ButtonId, React.ButtonHTMLAttributes<HTMLButtonElement>> = {
    // Like a real deck: Pause while paused releases and resumes.
    pause: { onClick: status === 'paused' ? pressPlay : pressPause },
    rewind: seek.bind('back'),
    play: { onClick: pressPlay },
    forward: seek.bind('forward'),
    stop: { onClick: pressStop }
  }
  const pressed: Partial<Record<ButtonId, boolean>> = { rewind: seek.held === 'back', forward: seek.held === 'forward' }
  // Latched keys stay pushed down, like a cassette deck.
  const latched: Partial<Record<ButtonId, boolean>> = { play: status === 'playing', pause: status === 'paused' }

  return (
    <div className="cp-stage">
    {/* CSS transform keeps pointer events, drag-and-drop and the drag region correct: the browser maps input through it. */}
    <div className="cp" style={{ width: WINDOW.width, height: WINDOW.height, left: fit.left, top: fit.top, transform: `scale(${fit.scale})` }}>
      {STATIC_LAYERS.map((id) => (
        <Layer key={id} id={id} />
      ))}
      <Reel circle={REELS.left} reelRef={reels.left} />
      <Reel circle={REELS.right} reelRef={reels.right} />
      {TOP_LAYERS.map((id) => (
        <Layer key={id} id={id} />
      ))}

      {(Object.keys(BUTTONS) as ButtonId[]).map((id) => (
        <button
          key={id}
          type="button"
          aria-label={id}
          aria-pressed={id === 'rewind' || id === 'forward' ? !!pressed[id] : undefined}
          className={`cp-btn${pressed[id] ? ' pressed' : ''}${latched[id] ? ' latched' : ''}`}
          disabled={off[id]}
          style={{ ...rectStyle(BUTTONS[id]), backgroundImage: `url(${layerUrl('bodyButtons')})`, backgroundSize: `${WINDOW.width}px ${WINDOW.height}px`, backgroundPosition: `${-BUTTONS[id].x}px ${-BUTTONS[id].y}px` }}
          {...buttonProps[id]}
        />
      ))}

      <div className={`cp-title${title === PROMPT ? ' empty' : ''}`} style={rectStyle(LABEL.title)}>
        {/* TODO: bundle a condensed display font for identical cross-OS rendering. */}
        {title}
      </div>
      {loaded && (
        <div className="cp-time" style={rectStyle(LABEL.time)}>
          {formatTime(position)} / {durationMs === null ? '--:--' : formatTime(durationMs)}
        </div>
      )}

      <button ref={openBtn} type="button" className={`cp-open${dragging ? ' dragging' : ''}`} aria-label="Open audio file" aria-haspopup="menu" aria-expanded={menuOpen} style={rectStyle(CASSETTE)} onClick={() => setMenuOpen((o) => !o)}>
        <span className="cp-hint">Click to open</span>
      </button>
      {menuOpen && (
        <div className="cp-menu" role="menu" style={{ left: MENU.x, top: MENU.y }} onKeyDown={menuKeys}>
          <button type="button" role="menuitem" autoFocus onClick={() => choose(openFile)}>Open file…</button>
          <button type="button" role="menuitem" onClick={() => choose(openAlbum)}>Open album…</button>
        </div>
      )}

      {error && (
        <button type="button" className="cp-toast" role="alert" style={{ left: CASSETTE.x + TOAST_INSET, width: CASSETTE.w - 2 * TOAST_INSET, bottom: WINDOW.height - (CASSETTE.y + CASSETTE.h) + 52 }} onClick={clearError}>
          {ERROR_MESSAGES[error.code]}
          <small>{error.message}</small>
        </button>
      )}

      <button type="button" className="cp-chrome cp-fullscreen" aria-label="Full screen" style={{ ...rectStyle(CHROME.fullscreen), backgroundImage: `url(${fileUrl(CHROME_ART.fullscreen)})` }} onClick={() => window.retro.toggleFullScreen()} />
      <button type="button" className="cp-chrome" aria-label="Minimize" style={rectStyle(CHROME.minimize)} onClick={() => window.retro.minimizeWindow()} />
      <button type="button" className="cp-chrome" aria-label="Close" style={rectStyle(CHROME.close)} onClick={() => window.retro.closeWindow()} />
    </div>
    </div>
  )
}
