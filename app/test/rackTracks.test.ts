import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { Album } from '../src/shared/protocol.ts'
import { scanWaiter } from '../src/main/rackTracks.ts'

const album = (dir: string): Album => ({ dir, title: 'T', artist: null, year: null, cover: null, tracks: [] })

test('request sends the path and resolves on the matching answer', async () => {
  const sent: string[] = []
  const w = scanWaiter((p) => sent.push(p), 1000)
  const p = w.request('/a')
  assert.deepEqual(sent, ['/a'])
  assert.equal(w.answer('/b', album('/b')), false)
  assert.equal(w.answer('/a', album('/a')), true)
  assert.deepEqual(await p, album('/a'))
  assert.equal(w.answer('/a', album('/a')), false)
})

test('duplicate requests share one send and all resolve', async () => {
  const sent: string[] = []
  const w = scanWaiter((p) => sent.push(p), 1000)
  const a = w.request('/a')
  const b = w.request('/a')
  assert.deepEqual(sent, ['/a'])
  assert.equal(w.answer('/a', null), true)
  assert.deepEqual(await Promise.all([a, b]), [null, null])
})

test('a request with no answer resolves null after the timeout, and the late answer is still consumed', async () => {
  const w = scanWaiter(() => {}, 5)
  assert.equal(await w.request('/a'), null)
  assert.equal(w.answer('/a', album('/a')), true)
  assert.equal(w.answer('/a', album('/a')), false)
})

test('a request after a timeout sends a fresh scan and both answers are consumed', async () => {
  const sent: string[] = []
  const w = scanWaiter((p) => sent.push(p), 5)
  assert.equal(await w.request('/a'), null)
  const p = w.request('/a')
  assert.deepEqual(sent, ['/a', '/a'])
  assert.equal(w.answer('/a', album('/a')), true)
  assert.deepEqual(await p, album('/a'))
  assert.equal(w.answer('/a', album('/a')), true)
  assert.equal(w.answer('/a', album('/a')), false)
})

test('a preview then a rack-add of the same path: the first answer is the preview, the second is recorded', async () => {
  const w = scanWaiter(() => {}, 1000)
  const p = w.request('/a')
  assert.equal(w.answer('/a', album('/a')), true)
  assert.equal(w.answer('/a', album('/a')), false)
  assert.deepEqual(await p, album('/a'))
})

test('reset settles pending requests with null and forgets owed scans', async () => {
  const w = scanWaiter(() => {}, 1000)
  const p = w.request('/a')
  w.reset()
  assert.equal(await p, null)
  assert.equal(w.answer('/a', album('/a')), false)
})
