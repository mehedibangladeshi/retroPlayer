import { pause, play, stop } from '../engine/commands'
import { useDisplayPosition, useEngine } from '../engine/useEngine'
import { ERROR_MESSAGES, formatTime } from '../format'
import { useFileDrop } from '../input/useFileDrop'
import { useKeyboard } from '../input/useKeyboard'
import { openFile } from '../input/openFile'
import { useSeekHold } from '../input/useSeekHold'
import { transportDisabled } from './transport'
import './DebugPlayer.css'

export default function DebugPlayer() {
  const { status, durationMs, trackInfo, error } = useEngine()
  const position = useDisplayPosition()
  const seek = useSeekHold()
  useKeyboard(seek)
  const dragging = useFileDrop()

  const off = transportDisabled(status)

  return (
    <div className={`dbg${dragging ? ' dragging' : ''}`}>
      <div className="dbg-bar">
        <span>Cassette Player: Retro (debug)</span>
        <button onClick={() => window.retro.minimizeWindow()}>_</button>
        <button onClick={() => window.retro.closeWindow()}>x</button>
      </div>
      <button onClick={() => void openFile()}>Open...</button>
      <div className="dbg-title">{trackInfo?.title ?? 'No track loaded (drop a file here)'}</div>
      <div className="dbg-time">
        {formatTime(position)} / {durationMs === null ? '--:--' : formatTime(durationMs)}
      </div>
      <div className="dbg-status">
        status: {status}
        {seek.held ? ` (seeking ${seek.held})` : ''}
      </div>
      <div className="dbg-buttons">
        <button disabled={off.pause} onClick={pause}>Pause</button>
        <button disabled={off.rewind} {...seek.bind('back')}>Rewind</button>
        <button disabled={off.play} onClick={play}>Play</button>
        <button disabled={off.forward} {...seek.bind('forward')}>Forward</button>
        <button disabled={off.stop} onClick={stop}>Stop</button>
      </div>
      {error && (
        <div className="dbg-error">
          {ERROR_MESSAGES[error.code]}
          <small>{error.message}</small>
        </div>
      )}
    </div>
  )
}
