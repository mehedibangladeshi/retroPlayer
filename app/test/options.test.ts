import { test } from 'node:test'
import assert from 'node:assert/strict'
import { AWAITING, optionsCommands, optionsStep, parseOptions } from '../src/main/options.ts'
import type { EngineEvent } from '../src/shared/protocol.ts'

const v = 1 as const
const opts = (volume: number, loop = false, shuffle = false): EngineEvent => ({ v, type: 'options', volume, loop, shuffle })

test('parseOptions: valid values pass, volume is clamped to 0..1', () => {
  assert.deepEqual(parseOptions({ volume: 0.5, loop: true, shuffle: false }), { volume: 0.5, loop: true, shuffle: false })
  assert.equal(parseOptions({ volume: 7, loop: false, shuffle: false })?.volume, 1)
  assert.equal(parseOptions({ volume: -1, loop: false, shuffle: false })?.volume, 0)
})

test('parseOptions: bad types or missing fields are rejected', () => {
  for (const bad of [null, 'x', {}, { volume: 'a', loop: true, shuffle: true }, { volume: NaN, loop: true, shuffle: true }, { volume: 1, loop: 1, shuffle: true }, { volume: 1, loop: true }])
    assert.equal(parseOptions(bad), undefined)
})

test('optionsCommands: nothing saved sends nothing, else volume, loop and shuffle', () => {
  assert.deepEqual(optionsCommands(undefined), [])
  assert.deepEqual(optionsCommands({ volume: 0.3, loop: true, shuffle: false }), [
    { v, type: 'setVolume', volume: 0.3 }, { v, type: 'setLoop', on: true }, { v, type: 'setShuffle', on: false }
  ])
})

const saved = { volume: 0.4, loop: true, shuffle: true }

test('optionsStep: the fresh engine\'s first options event is not saved, it cues the send and skips the 3 echoes', () => {
  assert.deepEqual(optionsStep(AWAITING, opts(1), saved), { skip: 3, sync: true })
  assert.deepEqual(optionsStep(AWAITING, opts(1), undefined), { skip: 0, sync: true })
})

test('optionsStep: the half-applied echoes are not saved, the one after them is', () => {
  let r = optionsStep(3, opts(0.4), saved)
  assert.deepEqual(r, { skip: 2, sync: false })
  r = optionsStep(r.skip, opts(0.4, true), saved)
  r = optionsStep(r.skip, opts(0.4, true, true), saved)
  assert.deepEqual(r, { skip: 0, sync: false })
  assert.deepEqual(optionsStep(r.skip, opts(0.2, true, true), saved), { skip: 0, save: { volume: 0.2, loop: true, shuffle: true }, sync: false })
})

test('optionsStep: an engine crash re-arms the wait; other events change nothing', () => {
  assert.deepEqual(optionsStep(0, { v, type: 'error', code: 'engine_crashed', message: '' }, saved), { skip: AWAITING, sync: false })
  assert.deepEqual(optionsStep(2, { v, type: 'ended' }, saved), { skip: 2, sync: false })
})
