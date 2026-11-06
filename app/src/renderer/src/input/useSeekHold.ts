import { useCallback, useEffect, useRef, useState } from 'react'
import { currentIndex, playSound, seek, seekRelative, stepTrack, stopSound } from '../engine/commands'
import { createHoldMotor } from './seekHold'
import { backAction } from './skip'
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

interface Active { dir: SeekDirection; source: SeekSource; status: Status; holding: boolean; motor: ReturnType<typeof createHoldMotor> }

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
    a.motor.end() // no-op for a short click that never began a hold
    active.current = null
    setHeld(null)
  }, [])

  const start = useCallback((dir: SeekDirection, source: SeekSource = 'pointer') => {
    const { status: st } = getSnapshot()
    if (active.current || st === 'empty') return
    const delta = dir === 'back' ? -STEP_MS : STEP_MS
    // A pointer press only becomes a seek hold after HOLD_DELAY_MS; a shorter press is a click (see release).
    const a: Active = { dir, source, status: st, holding: source === 'key', motor: createHoldMotor(() => playSound('motor', true), () => stopSound('motor')) }
    active.current = a
    const seekOnce = (): void => {
      a.holding = true
      setHeld(dir)
      playSound('seek') // once per press, not per repeat
      a.motor.begin()
      seekRelative(delta)
    }
    const repeat = (): void => {
      timers.current.repeat = setInterval(() => {
        const now = getSnapshot().status
        if (now === 'empty' || now !== a.status) stop()
        else seekRelative(delta)
      }, REPEAT_MS)
    }
    if (source === 'key') {
      // Keys seek at once, then repeat after the hold delay.
      seekOnce()
      timers.current.delay = setTimeout(repeat, HOLD_DELAY_MS)
    } else {
      timers.current.delay = setTimeout(() => {
        seekOnce()
        repeat()
      }, HOLD_DELAY_MS)
    }
  }, [stop])

  /** Pointer released: a press shorter than the hold delay changes track. */
  const release = useCallback(() => {
    const a = active.current
    if (a?.source !== 'pointer') return
    if (!a.holding) {
      if (a.dir === 'forward') stepTrack(1)
      else {
        const i = currentIndex()
        if (backAction(getSnapshot().positionMs, i) === 'restart') seek(0)
        else stepTrack(-1)
      }
    }
    stop('pointer')
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
      onPointerUp: release,
      onPointerCancel: () => stop('pointer'),
      onPointerLeave: () => stop('pointer')
    }),
    [start, stop, release]
  )

  return { held: status === 'empty' ? null : held, start, stop, bind }
}
