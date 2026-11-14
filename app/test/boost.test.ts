import { test } from 'node:test'
import assert from 'node:assert/strict'
import { BOOST_STEPS, boostLabel, nextBoost, stepBoost } from '../src/shared/boost.ts'

test('BOOST_STEPS are 0 to 12 in 3 dB steps', () => assert.deepEqual([...BOOST_STEPS], [0, 3, 6, 9, 12]))

test('nextBoost cycles and sends an unknown value to 0', () => {
  assert.deepEqual([0, 3, 6, 9, 12].map(nextBoost), [3, 6, 9, 12, 0])
  assert.equal(nextBoost(4), 0)
})

test('stepBoost moves one step, clamps at the ends, snaps a between value in the direction', () => {
  assert.equal(stepBoost(3, 1), 6)
  assert.equal(stepBoost(3, -1), 0)
  assert.equal(stepBoost(12, 1), 12)
  assert.equal(stepBoost(0, -1), 0)
  assert.equal(stepBoost(4, 1), 6)
  assert.equal(stepBoost(4, -1), 3)
})

test('boostLabel', () => {
  assert.equal(boostLabel(0), 'OFF')
  assert.equal(boostLabel(6), '+6 dB')
})
