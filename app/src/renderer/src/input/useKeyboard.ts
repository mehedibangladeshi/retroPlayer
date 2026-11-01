import { useEffect } from 'react'
import { togglePlayPause } from '../engine/commands'
import type { SeekHold } from './useSeekHold'

const KEY_DIR = { ArrowLeft: 'back', ArrowRight: 'forward' } as const

function isTextInput(t: EventTarget | null): boolean {
  return t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))
}

/** `onOpen` (optional) is bound to Ctrl/Cmd+O. */
export function useKeyboard(seek: Pick<SeekHold, 'start' | 'stop'>, onOpen?: () => void): void {
  const { start, stop } = seek
  useEffect(() => {
    const down = (e: KeyboardEvent): void => {
      if (onOpen && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'o') {
        e.preventDefault()
        if (!e.repeat) onOpen()
        return
      }
      if (isTextInput(e.target) || e.ctrlKey || e.altKey || e.metaKey) return
      if (e.code === 'Space') {
        e.preventDefault()
        if (!e.repeat) togglePlayPause()
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault()
        if (!e.repeat) start(KEY_DIR[e.key], 'key')
      }
    }
    const up = (e: KeyboardEvent): void => {
      if (isTextInput(e.target)) return
      if (e.code === 'Space') e.preventDefault() // stop a focused button from "clicking" on keyup
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') stop('key', KEY_DIR[e.key])
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [start, stop, onOpen])
}
