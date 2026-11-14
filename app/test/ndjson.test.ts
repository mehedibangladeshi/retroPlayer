import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isValidCommand, LineSplitter, parseEvent } from '../src/main/ndjson.ts'

const v = 1

test('isValidCommand accepts every renderer command', () => {
  for (const c of [
    { v, type: 'load', path: '/music/a.flac' },
    { v, type: 'load', path: 'C:\\Music\\B.MP3' },
    { v, type: 'play' },
    { v, type: 'pause' },
    { v, type: 'stop' },
    { v, type: 'seek', positionMs: 1000 },
    { v, type: 'seekRelative', deltaMs: -10000 },
    { v, type: 'playSound', name: 'click' },
    { v, type: 'playSound', name: 'stop' },
    { v, type: 'playSound', name: 'seek' },
    { v, type: 'playSound', name: 'motor', loop: true },
    { v, type: 'playSound', name: 'motor', loop: false },
    { v, type: 'stopSound', name: 'motor' }
  ]) {
    assert.equal(isValidCommand(c), true, JSON.stringify(c))
  }
})

test('isValidCommand accepts every supported extension in any case', () => {
  for (const ext of ['flac', 'wav', 'mp3', 'm4a', 'aac', 'ogg', 'oga', 'FLAC', 'Mp3']) {
    assert.equal(isValidCommand({ v, type: 'load', path: `/x/song.${ext}` }), true, ext)
  }
})

test('isValidCommand rejects loadSound from the renderer', () => {
  assert.equal(isValidCommand({ v, type: 'loadSound', name: 'click', path: '/x/a.mp3' }), false)
})

test('isValidCommand rejects unknown types, wrong version and non-objects', () => {
  assert.equal(isValidCommand({ v, type: 'explode' }), false)
  assert.equal(isValidCommand({ v: 2, type: 'play' }), false)
  assert.equal(isValidCommand({ type: 'play' }), false)
  assert.equal(isValidCommand(null), false)
  assert.equal(isValidCommand('play'), false)
})

test('isValidCommand rejects bad load paths', () => {
  for (const path of ['', '/x/notes.txt', '/x/noext', '/x/song.', 'flac', 42, null]) {
    assert.equal(isValidCommand({ v, type: 'load', path }), false, String(path))
  }
})

test('isValidCommand rejects bad seek values and sound names', () => {
  assert.equal(isValidCommand({ v, type: 'seek', positionMs: Infinity }), false)
  assert.equal(isValidCommand({ v, type: 'seekRelative', deltaMs: '5' }), false)
  assert.equal(isValidCommand({ v, type: 'playSound', name: 'boom' }), false)
  assert.equal(isValidCommand({ v, type: 'playSound', name: 'toString' }), false)
  assert.equal(isValidCommand({ v, type: 'playSound', name: 1 }), false)
  assert.equal(isValidCommand({ v, type: 'playSound', name: 'motor', loop: 'yes' }), false)
  assert.equal(isValidCommand({ v, type: 'stopSound', name: 'boom' }), false)
  assert.equal(isValidCommand({ v, type: 'stopSound' }), false)
})

test('parseEvent parses valid events', () => {
  assert.deepEqual(parseEvent('{"v":1,"type":"position","positionMs":5}'), { v, type: 'position', positionMs: 5 })
  assert.deepEqual(parseEvent('{"v":1,"type":"ended"}'), { v, type: 'ended' })
})

test('parseEvent drops invalid lines', (t) => {
  t.mock.method(console, 'error', () => {})
  assert.equal(parseEvent('not json'), null)
  assert.equal(parseEvent('{"v":2,"type":"ended"}'), null)
  assert.equal(parseEvent('{"v":1,"type":"mystery"}'), null)
  assert.equal(parseEvent('[1,2]'), null)
  assert.equal(parseEvent('null'), null)
})

test('LineSplitter splits across chunk boundaries and ignores empty lines', () => {
  const s = new LineSplitter()
  assert.deepEqual(s.push('{"a":'), [])
  assert.deepEqual(s.push('1}\n{"b":2}\n\n{"c"'), ['{"a":1}', '{"b":2}'])
  assert.deepEqual(s.push(':3}\r\n'), ['{"c":3}'])
  assert.deepEqual(s.push(''), [])
})

test('loadAlbum needs a non-empty string path', () => {
  assert.equal(isValidCommand({ v, type: 'loadAlbum', path: '/music/album' }), true)
  assert.equal(isValidCommand({ v, type: 'loadAlbum', path: '' }), false)
  assert.equal(isValidCommand({ v, type: 'loadAlbum', path: 3 }), false)
})

test('playIndex needs a non-negative integer', () => {
  for (const index of [0, 3]) assert.equal(isValidCommand({ v, type: 'playIndex', index }), true)
  for (const index of [-1, 1.5, '2', NaN]) assert.equal(isValidCommand({ v, type: 'playIndex', index }), false)
})

test('parseEvent accepts playlist events', () => {
  assert.equal(parseEvent(JSON.stringify({ v, type: 'playlist', album: null }))?.type, 'playlist')
  assert.equal(parseEvent(JSON.stringify({ v, type: 'playlist', album: { tracks: [] } }))?.type, 'playlist')
})

test('isValidCommand accepts setVolume, setLoop, setShuffle, next and previous', () => {
  for (const c of [
    { v, type: 'setVolume', volume: 0 },
    { v, type: 'setVolume', volume: 0.5 },
    { v, type: 'setLoop', on: true },
    { v, type: 'setLoop', on: false },
    { v, type: 'setShuffle', on: true },
    { v, type: 'setShuffle', on: false },
    { v, type: 'next' },
    { v, type: 'previous' }
  ]) {
    assert.equal(isValidCommand(c), true, JSON.stringify(c))
  }
})

test('isValidCommand rejects bad setVolume values', () => {
  for (const volume of [NaN, Infinity, '0.5', null]) {
    assert.equal(isValidCommand({ v, type: 'setVolume', volume }), false, String(volume))
  }
  assert.equal(isValidCommand({ v, type: 'setVolume' }), false)
})

test('isValidCommand rejects non-boolean setLoop and setShuffle values', () => {
  for (const type of ['setLoop', 'setShuffle']) {
    for (const on of [1, 'yes', null]) {
      assert.equal(isValidCommand({ v, type, on }), false, `${type} ${String(on)}`)
    }
    assert.equal(isValidCommand({ v, type }), false, `${type} missing on`)
  }
})

test('parseEvent accepts options and levels events', () => {
  const options = { v, type: 'options', volume: 0.8, loop: true, shuffle: false }
  assert.deepEqual(parseEvent(JSON.stringify(options)), options)
  const levels = { v, type: 'levels', rms: 0.1, peak: 0.4, bands: new Array(16).fill(0.2), wave: new Array(64).fill(0.3) }
  assert.deepEqual(parseEvent(JSON.stringify(levels)), levels)
})

test('parseEvent accepts artwork events', () => {
  assert.deepEqual(parseEvent('{"v":1,"type":"artwork","cover":null}'), { v, type: 'artwork', cover: null })
  assert.deepEqual(parseEvent('{"v":1,"type":"artwork","cover":"data:image/png;base64,AAAA"}'), { v, type: 'artwork', cover: 'data:image/png;base64,AAAA' })
})
