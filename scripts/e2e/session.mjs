// E2E for session restore: the player reopens on the last album, track and time, stopped, and Play resumes there.
// Drives the built app's renderers over the Chrome DevTools Protocol, quitting and relaunching it between steps.
// usage (after `pnpm build`; needs an audio device, since a load without one fails with no_output_device):
//   node scripts/e2e/session.mjs app /abs/path/to/throwaway-profile [--ozone-platform=x11]
// Set RETRO_SIDECAR to an engine binary. Uses a throwaway --user-data-dir (an absolute path), never the real profile.
// The test album is three quiet 60 s WAV files written to a temp folder and removed at the end.
import { spawn, execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const [appDir, ud, ...extra] = process.argv.slice(2)
const electron = execFileSync('node', ['-e', "console.log(require('electron'))"], { cwd: appDir }).toString().trim().split(/\r?\n/).pop()
const PORT = 9339
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let failures = 0
const check = (name, ok, info) => {
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok || info === undefined ? '' : ' ' + JSON.stringify(info)}`)
}
// An unpackaged app keeps its settings in `<userData>-dev` (app/src/main/index.ts).
const settingsFile = join(`${ud}-dev`, 'settings.json')
const savedSession = () => {
  try {
    return JSON.parse(readFileSync(settingsFile, 'utf8')).session
  } catch {
    return undefined
  }
}

/** 16-bit mono WAV of a quiet sine. */
function wav(file, seconds, freq, rate = 22050) {
  const n = seconds * rate
  const b = Buffer.alloc(44 + n * 2)
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16)
  b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(rate, 24); b.writeUInt32LE(rate * 2, 28)
  b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 2, 40)
  for (let i = 0; i < n; i++) b.writeInt16LE(Math.round(600 * Math.sin((2 * Math.PI * freq * i) / rate)), 44 + i * 2)
  writeFileSync(file, b)
}
const album = mkdtempSync(join(tmpdir(), 'retro-session-'))
for (const [i, f] of [220, 330, 440].entries()) wav(join(album, `0${i + 1} Track ${i + 1}.wav`), 60, f)

/** Launches the app; `player` and `list` evaluate an expression in the player and playlist renderers. */
async function launch() {
  const child = spawn(electron, ['.', `--remote-debugging-port=${PORT}`, `--user-data-dir=${ud}`, ...extra], {
    cwd: appDir,
    env: { ...process.env, RETRO_SIDECAR: process.env.RETRO_SIDECAR },
    stdio: 'ignore'
  })
  const exited = new Promise((r) => child.on('exit', r))
  let pages = []
  for (let i = 0; i < 150 && !(pages.some((p) => p.url.endsWith('#playlist')) && pages.some((p) => p.type === 'page' && !p.url.includes('#'))); i++) {
    await sleep(200)
    pages = await fetch(`http://127.0.0.1:${PORT}/json/list`).then((r) => r.json()).catch(() => [])
  }
  const connect = async (page) => {
    const ws = new WebSocket(page.webSocketDebuggerUrl)
    await new Promise((r) => ws.addEventListener('open', r))
    let id = 0
    const pending = new Map()
    ws.addEventListener('message', (m) => {
      const d = JSON.parse(m.data)
      pending.get(d.id)?.(d.result?.result?.value)
    })
    return (expr) =>
      new Promise((r) => {
        pending.set(++id, r)
        ws.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression: expr, awaitPromise: true, returnByValue: true } }))
      })
  }
  const player = await connect(pages.find((p) => p.type === 'page' && !p.url.includes('#')))
  const list = await connect(pages.find((p) => p.url.endsWith('#playlist')))
  for (let i = 0; i < 50 && !(await player(`!!document.querySelector('.cp-title')`)); i++) await sleep(100)
  // Closing the player quits the app, which saves the session on the way out.
  const quit = async () => {
    void player(`window.retro.closeWindow()`) // no reply: the app may be gone before it answers
    const ok = await Promise.race([exited.then(() => true), sleep(10000).then(() => false)])
    if (!ok) child.kill()
    check('app quits when the player closes', ok)
  }
  return { player, list, quit, kill: () => child.kill(), exited }
}

const ui = (player) => player(`({ title: document.querySelector('.cp-title').textContent, time: document.querySelector('.cp-time')?.textContent ?? null, latched: [...document.querySelectorAll('.cp-btn.latched')].map((b) => b.ariaLabel), error: document.querySelector('.cp-toast')?.textContent ?? null })`)
const current = (list) => list(`[...document.querySelectorAll('.pl-row')].findIndex((r) => r.classList.contains('current'))`)
const secs = (t) => {
  const [m, s] = (t ?? '0:00').split(' / ')[0].split(':').map(Number)
  return m * 60 + s
}
/** Waits for the restore to show a time (the player shows none while empty). */
async function restored(player) {
  for (let i = 0; i < 50; i++) {
    const u = await ui(player)
    if (u.time && secs(u.time) > 0) return u
    await sleep(100)
  }
  return ui(player)
}

try {
  // 1. Play track 2 past 0:30, then quit while it plays.
  let app = await launch()
  await app.player(`window.retro.send({ v: 1, type: 'loadAlbum', path: ${JSON.stringify(album)} })`)
  await sleep(1000)
  await app.player(`window.retro.send({ v: 1, type: 'playIndex', index: 1 })`)
  await sleep(800)
  await app.player(`window.retro.send({ v: 1, type: 'seek', positionMs: 30000 })`)
  await sleep(2500)
  let u = await ui(app.player)
  if (u.error) throw new Error(`engine error (no audio device?): ${u.error}`)
  check('plays track 2 past 0:31', (await current(app.list)) === 1 && secs(u.time) >= 31 && u.latched.includes('play'), u)
  const quitAt = secs(u.time)
  await app.quit()
  check('quit saved track 2 and its time', savedSession()?.index === 1 && savedSession()?.positionMs >= quitAt * 1000, savedSession())

  // 2. Relaunch: same track and time, stopped; Play resumes there. Record every save to catch a 0:00 mid-restore.
  const seen = []
  const watch = setInterval(() => seen.push(savedSession()?.positionMs), 10)
  app = await launch()
  u = await restored(app.player)
  check('restored on track 2', (await current(app.list)) === 1, await current(app.list))
  check('restored at the quit time, not playing', secs(u.time) >= quitAt && !u.latched.includes('play'), u)
  clearInterval(watch)
  check('restore never saved 0:00', !seen.includes(0), [...new Set(seen)])
  await app.player(`window.retro.send({ v: 1, type: 'play' })`)
  await sleep(2200)
  const v = await ui(app.player)
  check('Play resumes from the restored time', v.latched.includes('play') && secs(v.time) >= secs(u.time) + 1 && (await current(app.list)) === 1, v)
  await app.player(`window.retro.send({ v: 1, type: 'pause' })`)
  await sleep(300)
  const pausedAt = secs((await ui(app.player)).time)
  await app.quit()

  // 3. Relaunch after a pause: back at the paused time.
  app = await launch()
  u = await restored(app.player)
  check('restored at the paused time', secs(u.time) === pausedAt && !u.latched.includes('play'), { pausedAt, ...u })
  await app.quit()

  // 4. The album folder is gone: the player starts empty, shows no error, and forgets the session.
  rmSync(album, { recursive: true, force: true })
  app = await launch()
  await sleep(1500)
  u = await ui(app.player)
  check('missing album: empty player, no error', u.time === null && u.error === null, u)
  await app.quit()
  check('missing album: session dropped', savedSession() === undefined, savedSession())
} finally {
  rmSync(album, { recursive: true, force: true })
}
console.log(failures ? `${failures} FAILED` : 'all passed')
process.exit(failures ? 1 : 0)
