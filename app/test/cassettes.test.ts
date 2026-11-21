import { test } from 'node:test'
import assert from 'node:assert/strict'
import { CASSETTE_DESIGNS, isCassetteDesign, randomDesign } from '../src/shared/cassettes.ts'

test('isCassetteDesign accepts only known designs', () => {
  for (const d of CASSETTE_DESIGNS) assert.ok(isCassetteDesign(d))
  for (const v of ['purple', '', null, 3, undefined]) assert.ok(!isCassetteDesign(v))
})

test('randomDesign is deterministic with an injected rand and stays in range', () => {
  assert.equal(randomDesign(() => 0), 'black')
  assert.equal(randomDesign(() => 0.999999), 'yellow')
  assert.equal(randomDesign(() => 1), 'yellow')
  assert.ok(isCassetteDesign(randomDesign()))
})
