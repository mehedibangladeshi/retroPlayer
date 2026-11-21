import { test } from 'node:test'
import assert from 'node:assert/strict'
import { CASSETTE_DESIGNS } from '../src/shared/cassettes.ts'
import { cassetteFiles, nowPlayingDesign } from '../src/renderer/src/views/cassetteDesign.ts'

test('cassetteFiles: null is the original cassette', () => {
  assert.deepEqual(cassetteFiles(null), { base: 'png/cassette-base.png', mid: 'png/cassette-mid.png', reel: 'png/cassette-reel.png' })
})

test('cassetteFiles: every design maps to its own set', () => {
  for (const d of CASSETTE_DESIGNS)
    assert.deepEqual(cassetteFiles(d), { base: `png/cassette-${d}-base.png`, mid: `png/cassette-${d}-mid.png`, reel: `png/cassette-${d}-reel.png` })
})

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rack = (nowPlaying: string | null, spines: any[]): any => ({ sort: 'custom', spines, nowPlaying })

test('nowPlayingDesign', () => {
  const spines = [{ dir: '/a', design: 'red' }, { dir: '/b', design: null }]
  assert.equal(nowPlayingDesign(rack(null, spines)), null)
  assert.equal(nowPlayingDesign(rack('/zzz', spines)), null)
  assert.equal(nowPlayingDesign(rack('/b', spines)), null)
  assert.equal(nowPlayingDesign(rack('/a', spines)), 'red')
})
