import { useEffect } from 'react'
import { BUTTONS, CASSETTE, CHROME, LABEL, LAYERS, REELS, WINDOW, type ButtonId, type LayerId, type Rect } from '@shared/layout'
import { pause, play, stop } from '../engine/commands'
import { clearError } from '../engine/store'
import { useDisplayPosition, useEngine } from '../engine/useEngine'
import { ERROR_MESSAGES, formatTime } from '../format'
import { openFile } from '../input/openFile'
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

const rectStyle = (r: Rect): React.CSSProperties => ({ left: r.x, top: r.y, width: r.w, height: r.h })
const TOAST_INSET = 40
const PROMPT = 'CLICK OR DROP A FILE'
const STATIC_LAYERS: LayerId[] = ['bodyBase', 'cassetteBase', 'cassetteMid']
const TOP_LAYERS: LayerId[] = ['bodyTopCover', 'bodyBottom']
const layerRect = (id: LayerId): Rect => LAYERS.find((l) => l.id === id)!.rect

let dialogOpen = false
/** Only one native open dialog at a time. */
async function openOnce(): Promise<void> {
  if (dialogOpen) return
  dialogOpen = true
  try {
    await openFile()
  } finally {
    dialogOpen = false
  }
}

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
  const { status, durationMs, trackInfo, error } = useEngine()
  const position = useDisplayPosition()
  const seek = useSeekHold()
  useKeyboard(seek)
  const dragging = useFileDrop()
  const off = transportDisabled(status)
  const loaded = status !== 'empty'
  const title = trackInfo?.title || PROMPT

  const reels = useReels(status, seek.held)

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'o') {
        e.preventDefault()
        if (!e.repeat) void openOnce()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const buttonProps: Record<ButtonId, React.ButtonHTMLAttributes<HTMLButtonElement>> = {
    pause: { onClick: pause },
    rewind: seek.bind('back'),
    play: { onClick: play },
    forward: seek.bind('forward'),
    stop: { onClick: stop }
  }
  const pressed: Partial<Record<ButtonId, boolean>> = { rewind: seek.held === 'back', forward: seek.held === 'forward' }

  return (
    <div className="cp" style={{ width: WINDOW.width, height: WINDOW.height }}>
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
          className={`cp-btn${pressed[id] ? ' pressed' : ''}`}
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

      <button type="button" className={`cp-open${dragging ? ' dragging' : ''}`} aria-label="Open audio file" style={rectStyle(CASSETTE)} onClick={() => void openOnce()}>
        <span className="cp-hint">Click to open</span>
      </button>

      {error && (
        <button type="button" className="cp-toast" role="alert" style={{ left: CASSETTE.x + TOAST_INSET, width: CASSETTE.w - 2 * TOAST_INSET, bottom: WINDOW.height - (CASSETTE.y + CASSETTE.h) + 52 }} onClick={clearError}>
          {ERROR_MESSAGES[error.code]}
          <small>{error.message}</small>
        </button>
      )}

      <button type="button" className="cp-chrome" aria-label="Minimize" style={rectStyle(CHROME.minimize)} onClick={() => window.retro.minimizeWindow()} />
      <button type="button" className="cp-chrome" aria-label="Close" style={rectStyle(CHROME.close)} onClick={() => window.retro.closeWindow()} />
    </div>
  )
}
