import { test } from 'node:test'
import assert from 'node:assert/strict'
import { formatDuration, trackRowName } from '../src/renderer/src/views/trackRowName.ts'
import type { AlbumTrack } from '../src/shared/protocol.ts'

const t = (title: string, artist?: string): AlbumTrack => ({ title, artist: artist ?? null }) as unknown as AlbumTrack

test('row name numbers from 01 with a padded index', () => {
  assert.equal(trackRowName(t('A'), 0, null), '01. A')
  assert.equal(trackRowName(t('A'), 11, null), '12. A')
})
test('track artist wins over album artist, which is the fallback', () => {
  assert.equal(trackRowName(t('S', 'Tr'), 0, 'Al'), '01. Tr – S')
  assert.equal(trackRowName(t('S'), 1, 'Al'), '02. Al – S')
})
test('no artist at all leaves just the title', () => {
  assert.equal(trackRowName(t('S'), 2, null), '03. S')
})
test('durations: m:ss, h:mm:ss, null is empty', () => {
  assert.equal(formatDuration(null), '')
  assert.equal(formatDuration(65_000), '1:05')
  assert.equal(formatDuration(3_725_000), '1:02:05')
})
