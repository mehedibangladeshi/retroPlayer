import type { Command } from '@shared/protocol'
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

export function togglePlayPause(): void {
  const { status } = getSnapshot()
  if (status === 'playing') pause()
  else if (status === 'stopped' || status === 'paused') play()
}
