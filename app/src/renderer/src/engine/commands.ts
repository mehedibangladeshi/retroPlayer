import type { Command } from '@shared/protocol'
import type { SoundName } from '@shared/sounds'
import { expectAutoPlay, getSnapshot } from './store'

type Body = Command extends infer C ? (C extends unknown ? Omit<C, 'v'> : never) : never
function send(cmd: Body): void {
  window.retro.send({ v: 1, ...cmd } as Command)
}

/** Load a file; the store sends `play` once the engine reports it as loaded and stopped. */
export function loadAndPlay(path: string): void {
  expectAutoPlay(path)
  send({ type: 'load', path })
}
export const play = (): void => send({ type: 'play' })
export const pause = (): void => send({ type: 'pause' })
export const stop = (): void => send({ type: 'stop' })
export const seekRelative = (deltaMs: number): void => send({ type: 'seekRelative', deltaMs })
/** Key sound, played by the engine on top of the music. */
export const playSound = (name: SoundName): void => send({ type: 'playSound', name })

// Key presses: the key's sound, then the transport command. Keyboard shortcuts use these too.
export function pressPlay(): void {
  playSound('click')
  play()
}
export function pressPause(): void {
  playSound('click')
  pause()
}
export function pressStop(): void {
  playSound('stop')
  stop()
}

export function togglePlayPause(): void {
  const { status } = getSnapshot()
  if (status === 'playing') pressPause()
  else if (status === 'stopped' || status === 'paused') pressPlay()
}
