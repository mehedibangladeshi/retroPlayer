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
    { v, type: 'playSound', name: 'seek' }
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
