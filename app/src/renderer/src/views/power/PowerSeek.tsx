import { useRef, useState } from 'react'
import { POWER as R } from '@shared/layout'
import { useDisplayPosition, useEngine } from '../../engine/useEngine'
import { seek } from '../../engine/commands'
import { seekAt } from '../powerMath'
import './PowerSeek.css'

const S = R.SEEK

/** Seek bar: lit fill + thumb over the slot. Drag shows the pending position locally; seek is sent on release. */
export default function PowerSeek({ scale }: { scale: number }) {
  const { durationMs } = useEngine()
  const position = useDisplayPosition()
  const [dragMs, setDragMs] = useState<number | null>(null)
  const dragging = useRef(false)
  const enabled = durationMs !== null && durationMs > 0

  const at = (e: React.PointerEvent<HTMLDivElement>): number | null =>
    seekAt(S.x + (e.clientX - e.currentTarget.getBoundingClientRect().left) / scale, S, durationMs)
  const ms = dragMs ?? position
  const frac = enabled ? Math.min(1, Math.max(0, ms / durationMs)) : 0
  const end = (e: React.PointerEvent<HTMLDivElement>, commit: boolean): void => {
    if (!dragging.current) return
    dragging.current = false
    const t = at(e)
    setDragMs(null)
    if (commit && t !== null) seek(t)
  }

  return (
    <div className={`ps${enabled ? '' : ' off'}`} role="slider" aria-label="Seek" aria-disabled={!enabled} tabIndex={enabled ? 0 : -1}
      aria-valuemin={0} aria-valuemax={Math.round((durationMs ?? 0) / 1000)} aria-valuenow={Math.round(ms / 1000)}
      style={{ left: S.x, top: S.y, width: S.w, height: S.h }}
      onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); dragging.current = true; setDragMs(at(e)) }}
      onPointerMove={(e) => { if (dragging.current) setDragMs(at(e)) }}
      onPointerUp={(e) => end(e, true)}
      onPointerCancel={(e) => end(e, false)}
      onLostPointerCapture={() => { dragging.current = false; setDragMs(null) }}>
      <div className="ps-fill" style={{ width: `${frac * 100}%` }} />
      <div className="ps-thumb" style={{ left: `${frac * 100}%` }} />
    </div>
  )
}
