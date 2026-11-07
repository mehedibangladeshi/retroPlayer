// E2E for window docking: drives the built app's main process over the Node inspector.
// Moves made from here bypass the app's programmatic() bookkeeping, so the app sees them as user drags.
// usage (after `pnpm build`, Linux X11/XWayland, Windows or macOS):
//   node scripts/e2e/dock.mjs app /abs/path/to/throwaway-profile [--ozone-platform=x11]
// Set RETRO_SIDECAR to an engine binary. Uses a throwaway --user-data-dir (an absolute path), never the real profile.
import { spawn, execFileSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
// A real OS pointer drag (x0, y0 in DIP; converted to what each OS's input API expects). Resolves when the button is up.
function realDrag(x0, y0, dx, dy, scale, steps = 25) {
  const px = (v) => String(Math.round(v * (process.platform === 'darwin' ? 1 : scale)))
  const args = [px(x0), px(y0), px(dx), px(dy), String(steps)]
  const [cmd, argv] =
    process.platform === 'win32' ? ['powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', join(here, 'drag-win.ps1'), ...args]]
    : process.platform === 'darwin' ? ['swift', [join(here, 'drag-mac.swift'), ...args]]
    : ['python3', [join(here, 'drag-linux.py'), ...args]]
  return new Promise((res, rej) => spawn(cmd, argv, { stdio: 'inherit' }).on('exit', (c) => (c === 0 ? res() : rej(new Error(`${cmd} exited ${c}`)))))
}

const [appDir, ud, ...extra] = process.argv.slice(2)
const electron = execFileSync('node', ['-e', "console.log(require('electron'))"], { cwd: appDir }).toString().trim().split(/\r?\n/).pop() // first use may print a download line first
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let failures = 0
const check = (name, ok, info = '') => {
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : ' ' + info}`)
}

async function launch(port) {
  const child = spawn(electron, ['.', `--inspect=${port}`, `--user-data-dir=${ud}`, ...extra], {
    cwd: appDir,
    env: { ...process.env, RETRO_SIDECAR: process.env.RETRO_SIDECAR },
    stdio: 'ignore'
  })
  let list
  for (let i = 0; i < 50 && !list; i++) {
    await sleep(200)
    list = await fetch(`http://127.0.0.1:${port}/json/list`).then((r) => r.json()).catch(() => null)
  }
  const ws = new WebSocket(list[0].webSocketDebuggerUrl)
  await new Promise((r) => ws.addEventListener('open', r))
  let id = 0
  const pending = new Map()
  ws.addEventListener('message', (m) => {
    const d = JSON.parse(m.data)
    pending.get(d.id)?.(d)
  })
  const ev = (expr) =>
    new Promise((resolve, reject) => {
      const i = ++id
      pending.set(i, (d) => (d.result?.exceptionDetails ? reject(new Error(d.result.exceptionDetails.exception?.description)) : resolve(d.result?.result?.value)))
      const body = `(async () => { const { BrowserWindow, screen, app } = process.mainModule.require('electron');
        const all = BrowserWindow.getAllWindows();
        const byId = (k) => all.find((w) => k === 'player' ? !/#(playlist|album)/.test(w.webContents.getURL()) : w.webContents.getURL().endsWith('#' + k));
        ${expr} })()`
      ws.send(JSON.stringify({ id: i, method: 'Runtime.evaluate', params: { expression: body, awaitPromise: true, returnByValue: true } }))
    })
  // Slow first launches (macOS runners): wait until the player and both side windows are up.
  let up = 0
  for (let i = 0; i < 200 && up < 3; i++) {
    await sleep(200)
    up = await ev(`return all.filter((w) => w.isVisible()).length`).catch(() => 0)
  }
  if (up < 3) throw new Error('windows not up: ' + JSON.stringify(await ev(`return all.map((w) => [w.webContents.getURL(), w.isVisible()])`)))
  return { child, ev, ws }
}

const R = (ev) => ev(`return Object.fromEntries(['player','playlist','album'].map((k) => [k, byId(k)?.isVisible() ? byId(k).getBounds() : null]))`)
const move = (ev, k, x, y) => ev(`byId('${k}').setPosition(${x}, ${y})`)
// A user drag: many small steps, like a window manager delivers them.
async function drag(ev, k, dx, dy, steps = 15) {
  const b = (await R(ev))[k]
  for (let i = 1; i <= steps; i++) {
    await move(ev, k, Math.round(b.x + (dx * i) / steps), Math.round(b.y + (dy * i) / steps))
    await sleep(16)
  }
  await sleep(400) // drop + settle (120 ms) + async X11 configure
}
const flush = {
  right: (a, b) => b.x === a.x + a.width && b.y < a.y + a.height && a.y < b.y + b.height,
  left: (a, b) => b.x + b.width === a.x && b.y < a.y + a.height && a.y < b.y + b.height,
  bottom: (a, b) => b.y === a.y + a.height && b.x < a.x + a.width && a.x < b.x + b.width,
  top: (a, b) => b.y + b.height === a.y && b.x < a.x + a.width && a.x < b.x + b.width
}
const fmt = (r) => JSON.stringify(r)

// ---- run 1
let app = await launch(9341)
// Small windows, so every layout below fits on screen (the WM clamps windows into the work area).
await app.ev(`const w = byId('player'); const b = w.getBounds(); w.setSize(400, Math.round(400 * b.height / b.width))`)
await sleep(600)
let r = await R(app.ev)
const work = await app.ev(`return screen.getDisplayMatching(byId('player').getBounds()).workArea`)
console.log('work area', fmt(work), 'start', fmt(r))
check('startup: playlist docked right of player', flush.right(r.player, r.playlist), fmt(r))
check('startup: album docked left of player', flush.left(r.player, r.album), fmt(r))
check('startup: side windows take the player height', r.playlist.height === r.player.height && r.album.height === r.player.height, fmt(r))

// Centre the group so later moves stay on screen.
const cx = work.x + Math.round((work.width - r.player.width) / 2)
const cy = work.y + Math.round(work.height / 2 - r.player.height)
await drag(app.ev, 'player', cx - r.player.x, cy - r.player.y)
r = await R(app.ev)
check('player drag: playlist follows on the right', flush.right(r.player, r.playlist) && r.playlist.y === r.player.y, fmt(r))
check('player drag: album follows on the left', flush.left(r.player, r.album) && r.album.y === r.player.y, fmt(r))

// Mid-drag following (not only after the drop).
{
  const b = r.player
  let ok = true
  for (let i = 1; i <= 10; i++) {
    await move(app.ev, 'player', b.x + i * 7, b.y + i * 3)
    await sleep(40)
    const m = await R(app.ev)
    if (!flush.right(m.player, m.playlist) || !flush.left(m.player, m.album)) ok = false
  }
  check('player drag: docked windows follow during the drag', ok)
  await drag(app.ev, 'player', -70, -30, 3)
}

// Tear the playlist off: it stays put when the player moves.
r = await R(app.ev)
await drag(app.ev, 'playlist', 150, -200)
r = await R(app.ev)
const loose = r.playlist
await drag(app.ev, 'player', 20, 10)
r = await R(app.ev)
check('tear-off: detached playlist does not follow', r.playlist.x === loose.x && r.playlist.y === loose.y, fmt(r))
check('tear-off: album still follows', flush.left(r.player, r.album), fmt(r))
await drag(app.ev, 'player', -20, -10)

// Dock the playlist to the player's bottom (dropped 6 px short, offset 30 px).
r = await R(app.ev)
await drag(app.ev, 'playlist', r.player.x + 30 - r.playlist.x, r.player.y + r.player.height + 6 - r.playlist.y)
r = await R(app.ev)
check('bottom: playlist snaps flush below the player', flush.bottom(r.player, r.playlist) && r.playlist.x === r.player.x + 30, fmt(r))
await drag(app.ev, 'player', -40, -25)
r = await R(app.ev)
check('bottom: playlist follows the player, keeping its offset', flush.bottom(r.player, r.playlist) && r.playlist.x === r.player.x + 30, fmt(r))

// Window to window: album docks to the playlist's right (dropped 5 px off), then follows the player through the chain.
await drag(app.ev, 'album', r.playlist.x + r.playlist.width + 5 - r.album.x, r.playlist.y + 10 - r.album.y)
r = await R(app.ev)
check('chain: album snaps to the playlist right edge, top aligned', flush.right(r.playlist, r.album) && r.album.y === r.playlist.y, fmt(r))
await drag(app.ev, 'player', 35, 15)
r = await R(app.ev)
check('chain: player drag carries playlist and album', flush.bottom(r.player, r.playlist) && flush.right(r.playlist, r.album), fmt(r))

// Dragging the playlist away carries the album docked to it; the player stays.
const p0 = r.player
await drag(app.ev, 'playlist', 0, 80)
r = await R(app.ev)
check('sub-group: album comes along with the playlist', flush.right(r.playlist, r.album), fmt(r))
check('sub-group: player does not move', r.player.x === p0.x && r.player.y === p0.y, fmt(r))
await drag(app.ev, 'player', 10, 10)
r = await R(app.ev)
check('sub-group: detached group ignores player moves', !flush.bottom(r.player, r.playlist), fmt(r))

// Top: album dropped 8 px above the player (move the player down first so there is room above it).
r = await R(app.ev)
await drag(app.ev, 'player', 0, work.y + work.height - r.player.height - 20 - r.player.y)
r = await R(app.ev)
await drag(app.ev, 'album', r.player.x + 50 - r.album.x, r.player.y - r.album.height - 8 - r.album.y)
r = await R(app.ev)
check('top: album snaps flush above the player', flush.top(r.player, r.album), fmt(r))
await drag(app.ev, 'player', 15, 30)
r = await R(app.ev)
check('top: album follows the player', flush.top(r.player, r.album), fmt(r))

// The player dropped near the detached playlist snaps to it and picks it up.
r = await R(app.ev)
await drag(app.ev, 'playlist', r.player.x + r.player.width + 120 - r.playlist.x, r.player.y - r.playlist.y)
r = await R(app.ev)
await drag(app.ev, 'player', 120 - 7, 0)
r = await R(app.ev)
check('player drop: snaps onto the detached playlist', flush.right(r.player, r.playlist), fmt(r))
check('player drop: album above still docked', flush.top(r.player, r.album), fmt(r))
await drag(app.ev, 'player', -30, 10)
r = await R(app.ev)
check('player drop: playlist now follows', flush.right(r.player, r.playlist), fmt(r))

// Player resize: side windows take the new height and stay flush (room made first: the WM keeps windows on screen).
r = await R(app.ev)
await drag(app.ev, 'player', work.x + 60 - r.player.x, work.y + Math.round(r.player.height * 1.1) + 20 - r.player.y)
await app.ev(`const w = byId('player'); const b = w.getBounds(); w.setSize(Math.round(b.width * 1.1), Math.round(b.height * 1.1))`)
await sleep(500)
r = await R(app.ev)
check('resize: playlist keeps the player height and stays flush', r.playlist.height === r.player.height && flush.right(r.player, r.playlist), fmt(r))
check('resize: album stays flush above', flush.top(r.player, r.album), fmt(r))

// Shade the playlist and back (the bar stays docked).
// The roll-up button's IPC, as the renderer sends it.
const shadeIpc = `const { ipcMain } = process.mainModule.require('electron'); const w = byId('playlist'); ipcMain.emit('window:toggleShade', { sender: w.webContents, senderFrame: w.webContents.mainFrame })`
await app.ev(shadeIpc)
await sleep(600)
r = await R(app.ev)
check('shade: shaded playlist stays docked', r.playlist.height < 100 && flush.right(r.player, r.playlist), fmt(r))
await drag(app.ev, 'player', 20, 0)
r = await R(app.ev)
check('shade: shaded playlist follows', flush.right(r.player, r.playlist), fmt(r))
await app.ev(shadeIpc)
await sleep(600)
r = await R(app.ev)
check('unshade: playlist back to the player height, docked', r.playlist.height === r.player.height && flush.right(r.player, r.playlist), fmt(r))
// An OS minimize of a side window shades it instead (it has no taskbar entry), and must not leave it flagged minimized.
await app.ev(`byId('playlist').minimize()`)
await sleep(800)
r = await R(app.ev)
const minFlag = await app.ev(`return byId('playlist').isMinimized()`)
check('OS minimize: shades, stays docked, not stuck minimized', !minFlag && r.playlist.height < 100 && flush.right(r.player, r.playlist), fmt(r) + ' minimized=' + minFlag)
await drag(app.ev, 'player', -20, 0)
r = await R(app.ev)
check('OS minimize: shaded playlist follows', flush.right(r.player, r.playlist), fmt(r))

// A real OS pointer drag on the player's body (not a button): the window manager moves it, docked windows follow.
{
  r = await R(app.ev)
  await drag(app.ev, 'player', work.x + 200 - r.player.x, 0)
  const pt = await app.ev(`const w = byId('player'); const c = w.getContentBounds();
    const p = await w.webContents.executeJavaScript(\`(() => { const cp = document.querySelector('.cp'); const r = cp.getBoundingClientRect();
      for (let y = r.top + 40; y < r.bottom - 20; y += 8) for (let x = r.left + 40; x < r.right - 20; x += 8) {
        const e = document.elementFromPoint(x, y); if (e && cp.contains(e) && !e.closest('button, .cp-menu')) return { x, y } } return null })()\`);
    return p && { x: c.x + p.x, y: c.y + p.y, scale: screen.getDisplayMatching(c).scaleFactor }`)
  const start = await R(app.ev)
  const dx = 160
  const dy = 25
  let samples = 0
  let flushSamples = 0
  let done = false
  // Also check right after each of the app's own move events (Windows' move loop blocks the inspector mid-drag):
  // this listener is added after the app's, so it sees the result of the app's follow.
  await app.ev(`const w = byId('player'); globalThis.__rec = [];
    const f = () => { const p = w.getBounds(), pl = byId('playlist').getBounds(), al = byId('album').getBounds();
      __rec.push(pl.x === p.x + p.width && pl.y === p.y && al.y + al.height === p.y) };
    w.on('move', f); globalThis.__recOff = () => w.off('move', f)`)
  const dragging = realDrag(pt.x, pt.y, dx, dy, pt.scale).finally(() => (done = true))
  while (!done) {
    const m = await R(app.ev)
    if (m.player.x !== start.player.x || m.player.y !== start.player.y) {
      samples++
      if (flush.right(m.player, m.playlist) && flush.top(m.player, m.album)) flushSamples++
    }
    await sleep(40)
  }
  await dragging
  await sleep(500)
  const rec = await app.ev(`__recOff(); return __rec`)
  samples += rec.length
  flushSamples += rec.filter(Boolean).length
  r = await R(app.ev)
  const mx = r.player.x - start.player.x
  const my = r.player.y - start.player.y
  // OS drag thresholds (GTK, Windows) swallow the first few pixels of the pointer path.
  check('real drag: the OS moved the player', mx >= dx / 2 && my >= dy / 2, `moved ${mx},${my} from ${fmt(start.player)} at ${fmt(pt)}`)
  check('real drag: docked windows flush after the drop', flush.right(r.player, r.playlist) && flush.top(r.player, r.album), fmt(r))
  check('real drag: docked windows follow during the drag', samples > 0 && flushSamples / samples >= 0.8, `${flushSamples}/${samples} mid-drag samples flush`)
}

// Quit (saves settings), relaunch: docks come back from the saved positions.
const before = await R(app.ev)
void app.ev(`setTimeout(() => app.quit(), 50)`).catch(() => {})
app.ws.close() // --inspect holds the exit until the debugger disconnects
await new Promise((res) => app.child.on('exit', res))
app = await launch(9342)
r = await R(app.ev)
check('restart: playlist docked right again', flush.right(r.player, r.playlist), fmt(r))
check('restart: album docked on top again', flush.top(r.player, r.album) && r.album.x - r.player.x === before.album.x - before.player.x, fmt(r) + ' before ' + fmt(before))
await drag(app.ev, 'player', -25, 15)
r = await R(app.ev)
check('restart: both follow the player', flush.right(r.player, r.playlist) && flush.top(r.player, r.album), fmt(r))
void app.ev(`setTimeout(() => app.quit(), 50)`).catch(() => {})
app.ws.close() // --inspect holds the exit until the debugger disconnects
await new Promise((res) => app.child.on('exit', res))

console.log(failures ? `${failures} FAILED` : 'ALL PASS')
process.exit(failures ? 1 : 0)
