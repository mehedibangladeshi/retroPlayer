// Release helper: proposes and applies a version bump across app/package.json, engine/Cargo.toml and engine/Cargo.lock.
// Usage: node scripts/release-bump.mjs propose | bump <patch|minor|major|X.Y.Z> | ordinal
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const SEMVER = /^(\d+)\.(\d+)\.(\d+)$/

function parse(v) {
  const m = SEMVER.exec(v)
  if (!m) throw new Error(`invalid version "${v}", expected X.Y.Z`)
  return m.slice(1).map(Number)
}

export function nextVersion(current, kind) {
  const [maj, min, pat] = parse(current)
  if (kind === 'patch') return `${maj}.${min}.${pat + 1}`
  if (kind === 'minor') return `${maj}.${min + 1}.0`
  if (kind === 'major') return `${maj + 1}.0.0`
  parse(kind)
  return kind
}

export function proposeKind(messages, current) {
  const [major] = parse(current)
  const lines = messages.flatMap((m) => m.split('\n'))
  const headers = messages.map((m) => m.split('\n')[0])
  const breaking =
    headers.some((h) => /^\w+(\([^)]*\))?!:/.test(h)) || lines.some((l) => l.startsWith('BREAKING CHANGE:'))
  if (breaking) return major === 0 ? 'minor' : 'major'
  return headers.some((h) => /^feat(\([^)]*\))?:/.test(h)) ? 'minor' : 'patch'
}

// Replaces the first `version = "..."` / `"version": "..."` match of `re` at or after `from`, or throws.
function replaceAt(text, re, from, v, what) {
  const tail = text.slice(from)
  if (!re.test(tail)) throw new Error(`${what}: version line not found`)
  return text.slice(0, from) + tail.replace(re, (_, pre, post) => `${pre}${v}${post}`)
}

export function setPackageVersion(text, v) {
  // shortcut: first "version" key wins; package.json has it before any nested object, revisit if that changes.
  return replaceAt(text, /^(\s*"version":\s*")[^"]*(")/m, 0, v, 'package.json')
}

export function setWorkspaceVersion(text, v) {
  const start = text.indexOf('[workspace.package]')
  if (start < 0) throw new Error('Cargo.toml: [workspace.package] table not found')
  const end = text.indexOf('\n[', start + 1)
  const stop = end < 0 ? text.length : end
  const table = replaceAt(text.slice(start, stop), /^(version\s*=\s*")[^"]*(")/m, 0, v, 'Cargo.toml [workspace.package]')
  return text.slice(0, start) + table + text.slice(stop)
}

export function setLockVersions(text, v) {
  let out = text
  for (const name of ['engine-sidecar', 'player-core']) {
    const re = new RegExp(`(name = "${name}"\\nversion = ")[^"]*(")`)
    if (!re.test(out)) throw new Error(`Cargo.lock: package ${name} not found`)
    out = out.replace(re, (_, pre, post) => `${pre}${v}${post}`)
  }
  return out
}

const WORDS = [
  'First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth', 'Seventh', 'Eighth', 'Ninth', 'Tenth',
  'Eleventh', 'Twelfth', 'Thirteenth', 'Fourteenth', 'Fifteenth', 'Sixteenth', 'Seventeenth',
  'Eighteenth', 'Nineteenth', 'Twentieth'
]

export function ordinal(n) {
  if (!Number.isInteger(n) || n < 1 || n > 20) throw new Error(`ordinal: ${n} is outside 1..20`)
  return WORDS[n - 1]
}

if (import.meta.main) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
  const usage = 'Usage: node scripts/release-bump.mjs propose | bump <patch|minor|major|X.Y.Z> | ordinal'
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim()
  const files = {
    pkg: join(root, 'app/package.json'),
    toml: join(root, 'engine/Cargo.toml'),
    lock: join(root, 'engine/Cargo.lock')
  }
  const current = () => JSON.parse(readFileSync(files.pkg, 'utf8')).version
  const [cmd, arg] = process.argv.slice(2)

  if (cmd === 'propose') {
    const tag = git('describe', '--tags', '--abbrev=0')
    const messages = git('log', '--format=%B%x00', `${tag}..HEAD`).split('\0').map((m) => m.trim()).filter(Boolean)
    const kind = proposeKind(messages, current())
    console.log(`current: ${current()}\nlast tag: ${tag}\nproposed: ${kind}\nnext: ${nextVersion(current(), kind)}`)
  } else if (cmd === 'bump' && arg) {
    const old = current()
    const v = nextVersion(old, arg)
    // Compute every text before writing so a failure leaves the files untouched.
    const out = {
      pkg: setPackageVersion(readFileSync(files.pkg, 'utf8'), v),
      toml: setWorkspaceVersion(readFileSync(files.toml, 'utf8'), v),
      lock: setLockVersions(readFileSync(files.lock, 'utf8'), v)
    }
    for (const k of Object.keys(out)) writeFileSync(files[k], out[k])
    console.log(`${old} -> ${v}`)
  } else if (cmd === 'ordinal') {
    console.log(ordinal(git('tag', '-l', 'v*-beta').split('\n').filter(Boolean).length + 1))
  } else {
    console.error(usage)
    process.exit(1)
  }
}
