import { useCallback, useEffect, useRef, useState } from 'react'
import { seekRelative } from '../engine/commands'
import { getSnapshot, subscribe } from '../engine/store'
import { useEngine } from '../engine/useEngine'
import type { Status } from '@shared/protocol'

export type SeekDirection = 'back' | 'forward'
export type SeekSource = 'pointer' | 'key'
const STEP_MS = 10000
const HOLD_DELAY_MS = 400
const REPEAT_MS = 200

export interface SeekHold {
  held: SeekDirection | null
  /** Begin a hold (source defaults to 'pointer'). No-op if a hold is active or nothing is loaded. */
  start: (dir: SeekDirection, source?: SeekSource) => void
  /** End the active hold; with a source (and optional direction) only if it matches. */
  stop: (source?: SeekSource, dir?: SeekDirection) => void
  /** Pointer handlers for a seek button. */
  bind: (dir: SeekDirection) => {
    onPointerDown: (e: React.PointerEvent) => void
    onPointerUp: () => void
    onPointerCancel: () => void
    onPointerLeave: () => void
  }
}

interface Active { dir: SeekDirection; source: SeekSource; status: Status }

export function useSeekHold(): SeekHold {
  const [held, setHeld] = useState<SeekDirection | null>(null)
  const active = useRef<Active | null>(null)
  const timers = useRef<{ delay?: ReturnType<typeof setTimeout>; repeat?: ReturnType<typeof setInterval> }>({})
  const { status } = useEngine()

  const stop = useCallback((source?: SeekSource, dir?: SeekDirection) => {
    const a = active.current
    if (!a) return
    if ((source && a.source !== source) || (dir && a.dir !== dir)) return
    clearTimeout(timers.current.delay)
    clearInterval(timers.current.repeat)
    active.current = null
    setHeld(null)
  }, [])

  const start = useCallback((dir: SeekDirection, source: SeekSource = 'pointer') => {
    const { status: st } = getSnapshot()
    if (active.current || st === 'empty') return
    const delta = dir === 'back' ? -STEP_MS : STEP_MS
    active.current = { dir, source, status: st }
    setHeld(dir)
    seekRelative(delta)
    timers.current.delay = setTimeout(() => {
      timers.current.repeat = setInterval(() => {
        const now = getSnapshot().status
        if (now === 'empty' || now !== active.current?.status) stop()
        else seekRelative(delta)
      }, REPEAT_MS)
    }, HOLD_DELAY_MS)
  }, [stop])

  useEffect(() => {
    // End the hold when the engine status changes (e.g. playback ended or stopped).
    const unsub = subscribe(() => {
      const a = active.current
      if (a && getSnapshot().status !== a.status) stop()
    })
    const onBlur = (): void => stop()
    window.addEventListener('blur', onBlur)
    return () => {
      unsub()
      window.removeEventListener('blur', onBlur)
      stop()
    }
  }, [stop])

  const bind = useCallback(
    (dir: SeekDirection) => ({
      onPointerDown: (e: React.PointerEvent) => {
        if (e.button === 0) start(dir, 'pointer')
      },
      onPointerUp: () => stop('pointer'),
      onPointerCancel: () => stop('pointer'),
      onPointerLeave: () => stop('pointer')
    }),
    [start, stop]
  )

  return { held: status === 'empty' ? null : held, start, stop, bind }
}
