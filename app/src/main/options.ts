import { PROTOCOL_VERSION, type Command, type EngineEvent } from '@shared/protocol'

/** Volume, loop and shuffle: the engine owns them, main saves them in settings.json and sends them back after a (re)start. */
export interface Options { volume: number; loop: boolean; shuffle: boolean }

export function parseOptions(x: unknown): Options | undefined {
  if (typeof x !== 'object' || x === null) return undefined
  const r = x as Record<string, unknown>
  if (typeof r.volume !== 'number' || !Number.isFinite(r.volume) || typeof r.loop !== 'boolean' || typeof r.shuffle !== 'boolean') return undefined
  return { volume: Math.min(1, Math.max(0, r.volume)), loop: r.loop, shuffle: r.shuffle }
}

export function optionsCommands(o: Options | undefined): Command[] {
  const v = PROTOCOL_VERSION
  return o ? [{ v, type: 'setVolume', volume: o.volume }, { v, type: 'setLoop', on: o.loop }, { v, type: 'setShuffle', on: o.shuffle }] : []
}

/** `skip` value of a fresh engine that has not yet announced its defaults. */
export const AWAITING = -1

/**
 * Startup race rule. `skip` is AWAITING, or the number of `options` events still not to save. A fresh engine's first
 * `options` event (its defaults) is never saved; it cues sending the saved options (`sync`). The engine then echoes
 * one event per command sent (3), and the first two are half-applied, so all 3 are skipped. Later ones are saved.
 */
export function optionsStep(skip: number, evt: EngineEvent, saved: Options | undefined): { skip: number; save?: Options; sync: boolean } {
  if (evt.type === 'error' && evt.code === 'engine_crashed') return { skip: AWAITING, sync: false }
  if (evt.type !== 'options') return { skip, sync: false }
  if (skip === AWAITING) return { skip: optionsCommands(saved).length, sync: true }
  if (skip > 0) return { skip: skip - 1, sync: false }
  return { skip: 0, save: { volume: evt.volume, loop: evt.loop, shuffle: evt.shuffle }, sync: false }
}
