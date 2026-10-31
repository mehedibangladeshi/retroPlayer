// Builds the engine sidecar in release mode and copies it to app/build/sidecar/ for electron-builder.
// Usage: node scripts/stage-sidecar.mjs [--target <rust-triple>]  (a target is only needed to cross-build,
// e.g. x86_64-apple-darwin on an Apple Silicon runner).
import { execFileSync } from 'node:child_process'
import { copyFileSync, mkdirSync, rmSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const i = process.argv.indexOf('--target')
const target = i > 0 ? process.argv[i + 1] : undefined

const args = ['build', '--release', '--manifest-path', join(root, 'engine/Cargo.toml'), '-p', 'engine-sidecar']
if (target) args.push('--target', target)
execFileSync('cargo', args, { stdio: 'inherit' })

const exe = 'engine-sidecar' + (process.platform === 'win32' ? '.exe' : '')
const src = join(root, 'engine/target', target ?? '', 'release', exe)
const outDir = join(root, 'app/build/sidecar')
rmSync(outDir, { recursive: true, force: true })
mkdirSync(outDir, { recursive: true })
copyFileSync(src, join(outDir, exe))
console.log(`staged ${src} -> ${join(outDir, exe)}`)
