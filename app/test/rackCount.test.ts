import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cassetteCount } from '../src/renderer/src/views/rackCount.ts'

test('cassetteCount: singular for one, plural otherwise', () => {
  assert.equal(cassetteCount(0), '0 Cassettes')
  assert.equal(cassetteCount(1), '1 Cassette')
  assert.equal(cassetteCount(12), '12 Cassettes')
})
