import { test } from 'node:test'
import assert from 'node:assert/strict'
import { AWAITING, optionsCommands, optionsStep, parseOptions } from '../src/main/options.ts'
import type { EngineEvent } from '../src/shared/protocol.ts'

const v = 1 as const
const opts = (volume: number, loop = false, shuffle = false, boostDb = 0): EngineEvent => ({ v, type: 'options', volume, loop, shuffle, boostDb })

test('parseOptions: valid values pass, volume is clamped to 0..1', () => {
  assert.deepEqual(parseOptions({ volume: 0.5, loop: true, shuffle: false, boostDb: 6 }), { volume: 0.5, loop: true, shuffle: false, boostDb: 6 })
  assert.equal(parseOptions({ volume: 7, loop: false, shuffle: false })?.volume, 1)
  assert.equal(parseOptions({ volume: -1, loop: false, shuffle: false })?.volume, 0)
})

test('parseOptions: a missing or non-finite boostDb becomes 0 (old settings.json), else it is clamped to 0..12', () => {
  const base = { volume: 1, loop: false, shuffle: false }
  assert.equal(parseOptions(base)?.boostDb, 0)
  assert.equal(parseOptions({ ...base, boostDb: NaN })?.boostDb, 0)
  assert.equal(parseOptions({ ...base, boostDb: 'x' })?.boostDb, 0)
  assert.equal(parseOptions({ ...base, boostDb: 30 })?.boostDb, 12)
  assert.equal(parseOptions({ ...base, boostDb: -3 })?.boostDb, 0)
})

test('parseOptions: bad types or missing fields are rejected', () => {
  for (const bad of [null, 'x', {}, { volume: 'a', loop: true, shuffle: true }, { volume: NaN, loop: true, shuffle: true }, { volume: 1, loop: 1, shuffle: true }, { volume: 1, loop: true }])
    assert.equal(parseOptions(bad), undefined)
})

test('optionsCommands: nothing saved sends nothing, else volume, loop, shuffle and boost', () => {
  assert.deepEqual(optionsCommands(undefined), [])
  assert.deepEqual(optionsCommands({ volume: 0.3, loop: true, shuffle: false, boostDb: 9 }), [
    { v, type: 'setVolume', volume: 0.3 }, { v, type: 'setLoop', on: true }, { v, type: 'setShuffle', on: false }, { v, type: 'setBoost', boostDb: 9 }
  ])
})

const saved = { volume: 0.4, loop: true, shuffle: true, boostDb: 3 }

test('optionsStep: the fresh engine\'s first options event is not saved, it cues the send and skips the 4 echoes', () => {
  assert.deepEqual(optionsStep(AWAITING, opts(1), saved), { skip: 4, sync: true })
  assert.deepEqual(optionsStep(AWAITING, opts(1), undefined), { skip: 0, sync: true })
})

test('optionsStep: the half-applied echoes are not saved, the one after them is', () => {
  let r = optionsStep(4, opts(0.4), saved)
  assert.deepEqual(r, { skip: 3, sync: false })
  r = optionsStep(r.skip, opts(0.4, true), saved)
  r = optionsStep(r.skip, opts(0.4, true, true), saved)
  r = optionsStep(r.skip, opts(0.4, true, true, 3), saved)
  assert.deepEqual(r, { skip: 0, sync: false })
  assert.deepEqual(optionsStep(r.skip, opts(0.2, true, true, 6), saved), { skip: 0, save: { volume: 0.2, loop: true, shuffle: true, boostDb: 6 }, sync: false })
})

test('optionsStep: an engine crash re-arms the wait; other events change nothing', () => {
  assert.deepEqual(optionsStep(0, { v, type: 'error', code: 'engine_crashed', message: '' }, saved), { skip: AWAITING, sync: false })
  assert.deepEqual(optionsStep(2, { v, type: 'ended' }, saved), { skip: 2, sync: false })
})
