import { test } from 'node:test'
import assert from 'node:assert/strict'
import { switchLamps } from '../src/renderer/src/views/power/powerSwitch.ts'

test('switch on lights the green lamp only', () => assert.deepEqual(switchLamps(true), { red: false, green: true }))
test('switch off lights the red lamp only', () => assert.deepEqual(switchLamps(false), { red: true, green: false }))
