import { test } from 'node:test'
import assert from 'node:assert/strict'

type Handler = (e: unknown) => void
let emit: Handler = () => {}
;(globalThis as unknown as { window: unknown }).window = {
  retro: { onEvent: (h: Handler) => ((emit = h), () => {}), send: () => {} }
}
const store = await import('../src/renderer/src/engine/store.ts')
store.start()

test('options events update the store', () => {
  assert.deepEqual(store.getSnapshot().options, { volume: 1, loop: false, shuffle: false, boostDb: 0 })
  emit({ v: 1, type: 'options', volume: 0.4, loop: true, shuffle: true, boostDb: 6 })
  assert.deepEqual(store.getSnapshot().options, { volume: 0.4, loop: true, shuffle: true, boostDb: 6 })
})
test('levels events leave the snapshot untouched', () => {
  const before = store.getSnapshot()
  emit({ v: 1, type: 'levels', rms: 0.5, peak: 0.9, bands: [0], wave: [0] })
  assert.equal(store.getSnapshot(), before)
})
