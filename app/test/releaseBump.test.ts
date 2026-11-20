import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  nextVersion,
  ordinal,
  proposeKind,
  setLockVersions,
  setPackageVersion,
  setWorkspaceVersion
} from '../../scripts/release-bump.mjs'

test('nextVersion bumps patch, minor and major', () => {
  assert.equal(nextVersion('0.3.1', 'patch'), '0.3.2')
  assert.equal(nextVersion('0.3.1', 'minor'), '0.4.0')
  assert.equal(nextVersion('0.3.1', 'major'), '1.0.0')
})

test('nextVersion accepts an explicit version and rejects junk', () => {
  assert.equal(nextVersion('0.3.1', '2.0.5'), '2.0.5')
  assert.throws(() => nextVersion('0.3.1', 'bogus'), /version/i)
  assert.throws(() => nextVersion('0.3.1', '1.2'), /version/i)
  assert.throws(() => nextVersion('nope', 'patch'), /version/i)
})

test('proposeKind picks patch, minor or major from commit messages', () => {
  assert.equal(proposeKind(['fix(ui): a', 'docs: b'], '1.2.3'), 'patch')
  assert.equal(proposeKind(['fix: a', 'feat(rack): b\n\nbody'], '1.2.3'), 'minor')
  assert.equal(proposeKind(['feat!: a'], '1.2.3'), 'major')
  assert.equal(proposeKind(['refactor(core)!: a'], '1.2.3'), 'major')
  assert.equal(proposeKind(['fix: a\n\nBREAKING CHANGE: gone'], '1.2.3'), 'major')
  assert.equal(proposeKind([], '1.2.3'), 'patch')
})

test('proposeKind caps breaking changes at minor while major is 0', () => {
  assert.equal(proposeKind(['feat!: a'], '0.3.1'), 'minor')
  assert.equal(proposeKind(['fix: a\n\nBREAKING CHANGE: gone'], '0.3.1'), 'minor')
})

test('setPackageVersion replaces only the top-level version', () => {
  const text = '{\n  "name": "app",\n  "version": "0.3.1",\n  "dependencies": {\n    "version": "9.9.9"\n  }\n}\n'
  const out = setPackageVersion(text, '0.4.0')
  assert.equal(out, text.replace('"version": "0.3.1"', '"version": "0.4.0"'))
  assert.throws(() => setPackageVersion('{}', '0.4.0'), /version/)
})

const toml = `[workspace]
members = ["crates/*"]

[workspace.package]
edition = "2021"
version = "0.3.1"

[workspace.dependencies]
serde = { version = "1" }

[other]
version = "7.7.7"
`

test('setWorkspaceVersion touches only [workspace.package]', () => {
  const out = setWorkspaceVersion(toml, '0.4.0')
  assert.equal(out, toml.replace('version = "0.3.1"', 'version = "0.4.0"'))
  assert.throws(() => setWorkspaceVersion('[other]\nversion = "1"\n', '0.4.0'), /workspace\.package/)
})

const lock = `[[package]]
name = "engine-sidecar"
version = "0.3.1"
dependencies = [
 "player-core",
]

[[package]]
name = "serde"
version = "1.0.200"
source = "registry+https://github.com/rust-lang/crates.io-index"

[[package]]
name = "player-core"
version = "0.3.1"
`

test('setLockVersions updates our two crates and leaves third-party ones', () => {
  const out = setLockVersions(lock, '0.4.0')
  assert.equal(out, lock.replaceAll('version = "0.3.1"', 'version = "0.4.0"'))
  assert.match(out, /name = "serde"\nversion = "1.0.200"/)
})

test('setLockVersions throws when a crate is missing', () => {
  const noCore = lock.replace(/\[\[package\]\]\nname = "player-core"\nversion = "0.3.1"\n/, '')
  assert.throws(() => setLockVersions(noCore, '0.4.0'), /player-core/)
  assert.throws(() => setLockVersions('', '0.4.0'), /engine-sidecar/)
})

test('ordinal spells 1 to 20 and rejects the rest', () => {
  assert.equal(ordinal(1), 'First')
  assert.equal(ordinal(11), 'Eleventh')
  assert.equal(ordinal(20), 'Twentieth')
  assert.throws(() => ordinal(0), /1/)
  assert.throws(() => ordinal(21), /20/)
})
