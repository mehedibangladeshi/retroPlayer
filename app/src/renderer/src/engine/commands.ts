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
/** Engine auto-plays an album, so no expectAutoPlay here. */
export const loadAlbum = (path: string): void => send({ type: 'loadAlbum', path })
export const playIndex = (index: number): void => send({ type: 'playIndex', index })
export const stopSound = (name: SoundName): void => send({ type: 'stopSound', name })
/** Key sound, played by the engine on top of the music. */
export const playSound = (name: SoundName, loop = false): void => send(loop ? { type: 'playSound', name, loop } : { type: 'playSound', name })

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

export const setVolume = (volume: number): void => send({ type: 'setVolume', volume })
export const setLoop = (on: boolean): void => send({ type: 'setLoop', on })
export const setShuffle = (on: boolean): void => send({ type: 'setShuffle', on })
export const next = (): void => send({ type: 'next' })
export const previous = (): void => send({ type: 'previous' })

/** Next (+1) or previous (-1) track; the engine owns play order and shuffle. */
export function stepTrack(delta: 1 | -1): void {
  if (delta === 1) next()
  else previous()
}

/** Index of the playing track in the album, or null with no album or an unlisted track. */
export function currentIndex(): number | null {
  const { album, trackInfo } = getSnapshot()
  const i = album?.tracks.findIndex((t) => t.path === trackInfo?.path) ?? -1
  return i < 0 ? null : i
}

export const seek = (positionMs: number): void => send({ type: 'seek', positionMs })
