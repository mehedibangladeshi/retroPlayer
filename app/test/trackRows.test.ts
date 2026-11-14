import { test } from 'node:test'
import assert from 'node:assert/strict'
import { formatDuration, mixedArtists, trackRowName } from '../src/renderer/src/views/trackRowName.ts'
import type { Album, AlbumTrack } from '../src/shared/protocol.ts'

const t = (title: string, artist?: string): AlbumTrack => ({ title, artist: artist ?? null }) as unknown as AlbumTrack
const album = (artist: string | null, tracks: AlbumTrack[]): Album => ({ dir: '/x', title: 'X', artist, year: null, cover: null, tracks }) as unknown as Album

test('row name numbers from 01 with a padded index', () => {
  assert.equal(trackRowName(t('A'), 0, false, null), '01. A')
  assert.equal(trackRowName(t('A'), 11, false, null), '12. A')
})
test('artist shown when asked: track artist wins over album artist, which is the fallback', () => {
  assert.equal(trackRowName(t('S', 'Tr'), 0, true, 'Al'), '01. Tr – S')
  assert.equal(trackRowName(t('S'), 1, true, 'Al'), '02. Al – S')
})
test('artist hidden when not asked, even if one exists', () => {
  assert.equal(trackRowName(t('S', 'Tr'), 0, false, 'Al'), '01. S')
})
test('no artist at all leaves just the title, even when asked', () => {
  assert.equal(trackRowName(t('S'), 2, true, null), '03. S')
})
test('same-artist album is not mixed', () => {
  const a = album('Al', [t('One'), t('Two', 'Al')])
  assert.equal(mixedArtists(a), false)
})
test('tracks with differing artists are mixed', () => {
  const a = album('Al', [t('One', 'A'), t('Two', 'B')])
  assert.equal(mixedArtists(a), true)
})
test('all-null artists are not mixed', () => {
  assert.equal(mixedArtists(album(null, [t('One'), t('Two')])), false)
})
test('one track with no artist, album artist matching the rest, is not mixed', () => {
  const a = album('X', [t('One', 'X'), t('Two')])
  assert.equal(mixedArtists(a), false)
})
test('durations: m:ss, h:mm:ss, null is empty', () => {
  assert.equal(formatDuration(null), '')
  assert.equal(formatDuration(65_000), '1:05')
  assert.equal(formatDuration(3_725_000), '1:02:05')
})
