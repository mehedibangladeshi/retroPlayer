import { useEffect } from 'react'
import { stepTrack, togglePlayPause } from '../engine/commands'
import { openAlbum } from './openFile'
import type { SeekHold } from './useSeekHold'

const KEY_DIR = { ArrowLeft: 'back', ArrowRight: 'forward' } as const

function isTextInput(t: EventTarget | null): boolean {
  return t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))
}

/** `onOpen` (optional) is bound to Ctrl/Cmd+O; Ctrl/Cmd+Shift+O opens an album and Ctrl/Cmd+L shows the playlist. */
export function useKeyboard(seek: Pick<SeekHold, 'start' | 'stop'>, onOpen?: () => void): void {
  const { start, stop } = seek
  useEffect(() => {
    // Keys inside the Open menu belong to its buttons (Space/Enter activate, arrows move focus).
    const inMenu = (e: KeyboardEvent): boolean => !!(e.target as Element | null)?.closest?.('.cp-menu')
    const down = (e: KeyboardEvent): void => {
      if (inMenu(e)) return
      if ((e.ctrlKey || e.metaKey) && !e.altKey) {
        const k = e.key.toLowerCase()
        const act = k === 'o' ? (e.shiftKey ? () => void openAlbum() : onOpen) : k === 'l' && !e.shiftKey ? () => window.retro.showPlaylist() : undefined
        if (act) {
          e.preventDefault()
          if (!e.repeat) act()
          return
        }
      }
      if (isTextInput(e.target) || e.ctrlKey || e.altKey || e.metaKey) return
      if (e.code === 'Space') {
        e.preventDefault()
        if (!e.repeat) togglePlayPause()
      } else if (e.key.toLowerCase() === 'n' || e.key.toLowerCase() === 'p') {
        if (!e.repeat) stepTrack(e.key.toLowerCase() === 'n' ? 1 : -1)
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault()
        if (!e.repeat) start(KEY_DIR[e.key], 'key')
      }
    }
    const up = (e: KeyboardEvent): void => {
      if (inMenu(e) || isTextInput(e.target)) return
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
