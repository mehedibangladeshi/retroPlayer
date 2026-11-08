import { test } from 'node:test'
import assert from 'node:assert/strict'
import { nextSession, parseSession, restoreCommands, restoreStep, type Session } from '../src/main/session.ts'
import type { Album, EngineEvent, TrackInfo } from '../src/shared/protocol.ts'

const v = 1 as const
const info = (path: string): TrackInfo => ({ title: 't', path, codec: 'flac', sampleRate: 44100, channels: 2 })
const state = (path: string | null, positionMs: number, status: 'stopped' | 'playing' | 'paused' | 'empty' = 'playing'): EngineEvent => ({ v, type: 'state', status, positionMs, durationMs: 1000, trackInfo: path ? info(path) : null })
const album: Album = { dir: '/m/a', title: null, artist: null, year: null, cover: null, tracks: ['/m/a/1.flac', '/m/a/2.flac'].map((path) => ({ path, title: 't', artist: null, trackNo: null, durationMs: null })) }

test('nextSession: a track of the album records the album, its index and the position', () => {
  assert.deepEqual(nextSession(undefined, album, state('/m/a/2.flac', 42)), { path: '/m/a/2.flac', album: '/m/a', index: 1, positionMs: 42 })
})

test('nextSession: a single file records no album', () => {
  assert.deepEqual(nextSession(undefined, null, state('/x/s.mp3', 7)), { path: '/x/s.mp3', album: null, index: 0, positionMs: 7 })
})

test('nextSession: position ticks move the position of the current session only', () => {
  const s: Session = { path: '/x/s.mp3', album: null, index: 0, positionMs: 7 }
  assert.deepEqual(nextSession(s, null, { v, type: 'position', positionMs: 900 }), { ...s, positionMs: 900 })
  assert.equal(nextSession(undefined, null, { v, type: 'position', positionMs: 900 }), undefined)
})

test('nextSession: an empty engine (startup, restart) keeps the saved session', () => {
  const s: Session = { path: '/x/s.mp3', album: null, index: 0, positionMs: 7 }
  assert.equal(nextSession(s, null, state(null, 0, 'empty')), s)
  assert.equal(nextSession(s, null, { v, type: 'error', code: 'engine_crashed', message: '' }), s)
})

test('restoreCommands: an album loads at the track without playing, then seeks', () => {
  assert.deepEqual(restoreCommands({ path: '/m/a/2.flac', album: '/m/a', index: 1, positionMs: 42 }), [
    { v, type: 'loadAlbum', path: '/m/a', index: 1, play: false },
    { v, type: 'seek', positionMs: 42 }
  ])
})

test('restoreCommands: a single file loads (which never plays) and skips a seek to 0', () => {
  assert.deepEqual(restoreCommands({ path: '/x/s.mp3', album: null, index: 0, positionMs: 0 }), [{ v, type: 'load', path: '/x/s.mp3' }])
})

test('parseSession: keeps a valid session and rejects a corrupt one', () => {
  const s = { path: '/x/s.mp3', album: '/x', index: 2, positionMs: 5 }
  assert.deepEqual(parseSession(s), s)
  assert.deepEqual(parseSession({ ...s, album: null }), { ...s, album: null })
  for (const bad of [null, 3, {}, { ...s, path: '' }, { ...s, index: -1 }, { ...s, index: 1.5 }, { ...s, positionMs: -1 }, { ...s, positionMs: Infinity }, { ...s, album: 4 }]) {
    assert.equal(parseSession(bad), undefined, JSON.stringify(bad))
  }
})

test('restoreStep: waits for one track state per restore command, so the load at 0:00 is never saved', () => {
  const s: Session = { path: '/m/a/2.flac', album: '/m/a', index: 1, positionMs: 42 }
  let left = restoreCommands(s).length
  left = restoreStep(left, state(null, 0, 'empty')) // engine startup
  left = restoreStep(left, { v, type: 'playlist', album })
  left = restoreStep(left, { v, type: 'artwork', cover: null })
  assert.equal(left, 2)
  left = restoreStep(left, state('/m/a/2.flac', 0, 'stopped')) // the load, still at 0:00
  assert.equal(left, 1)
  assert.equal(restoreStep(left, state('/m/a/2.flac', 40, 'stopped')), 0) // the seek: restore done
})

test('restoreStep: an error ends the wait, and with no restore nothing waits', () => {
  assert.equal(restoreStep(2, { v, type: 'error', code: 'file_not_found', message: '' }), 0)
  assert.equal(restoreStep(0, state('/x.flac', 0)), 0)
})
