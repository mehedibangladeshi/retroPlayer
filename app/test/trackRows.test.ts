import { test } from 'node:test'
import assert from 'node:assert/strict'
import { formatDuration, trackRowName } from '../src/renderer/src/views/trackRowName.ts'
import type { AlbumTrack } from '../src/shared/protocol.ts'

const t = (title: string, artist?: string): AlbumTrack => ({ title, artist: artist ?? null }) as unknown as AlbumTrack

test('row name is "NN. Title" with a padded index, never the artist', () => {
  assert.equal(trackRowName(t('A'), 0), '01. A')
  assert.equal(trackRowName(t('A'), 11), '12. A')
  assert.equal(trackRowName(t('S', 'Tr'), 0), '01. S')
})
test('durations: m:ss, h:mm:ss, null is empty', () => {
  assert.equal(formatDuration(null), '')
  assert.equal(formatDuration(65_000), '1:05')
  assert.equal(formatDuration(3_725_000), '1:02:05')
})
