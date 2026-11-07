// E2E for window docking: drives the built app's main process over the Node inspector.
// Moves made from here bypass the app's programmatic() bookkeeping, so the app sees them as user drags.
// usage (after `pnpm build`, Linux X11/XWayland, Windows or macOS):
//   node scripts/e2e/dock.mjs app /abs/path/to/throwaway-profile [--ozone-platform=x11]
// Set RETRO_SIDECAR to an engine binary. Uses a throwaway --user-data-dir (an absolute path), never the real profile.
import { spawn, execFileSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { stackTopFirst, taskbarEntries } from './zorder.mjs'

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
const r0 = await R(app.ev) // first launch: side windows open at the player's height (or their minimum size)
const mins = await app.ev(`return Object.fromEntries(['playlist','album'].map((k) => [k, byId(k).getMinimumSize()]))`)
const atPlayerHeight = (k) => Math.abs(r0[k].height - r0.player.height) <= 2 || r0[k].width === mins[k][0]
// Windows small enough that two stacked ones fit the work area with a little room (CI screens are as small as
// 1024x677, and macOS also keeps windows above the bottom of the work area), but not below the player's minimum.
const H = await app.ev(`const w = byId('player'); const b = w.getBounds(); const a = screen.getDisplayMatching(b).workArea;
  const h = Math.max(308, Math.min(330, Math.floor((a.height - 20) / 2))); w.setSize(Math.round(h * b.width / b.height), h); return h`)
await sleep(600)
let r = await R(app.ev)
const work = await app.ev(`return screen.getDisplayMatching(byId('player').getBounds()).workArea`)
console.log('work area', fmt(work), 'start', fmt(r))
check('startup: playlist docked right of player', flush.right(r.player, r.playlist), fmt(r))
check('startup: album docked left of player', flush.left(r.player, r.album), fmt(r))
check('startup: side windows open at the player height', atPlayerHeight('playlist') && atPlayerHeight('album'), fmt(r0) + ' min ' + fmt(mins))
check('startup: a player resize leaves the side windows their own size', r.playlist.height === r0.playlist.height && r.album.height === r0.album.height, fmt(r))
check('every window is user-resizable', await app.ev(`return ['player','playlist','album'].every((k) => byId(k).isResizable())`))
// The checks below expect every window at the player's height: resize the side windows to it, as a user would.
await app.ev(`for (const k of ['playlist', 'album']) { const w = byId(k); const b = w.getBounds(); w.setSize(Math.round(${H} * b.width / b.height), ${H}) }`)
await sleep(700)
r = await R(app.ev)
check('side resize: both side windows take the new height, still docked', r.playlist.height === H && r.album.height === H && flush.right(r.player, r.playlist) && flush.left(r.player, r.album), fmt(r))

// One taskbar/dock icon for the app, and activating it (it activates the player) brings every window forward.
{
  const ids = await app.ev(`return Object.fromEntries(['player','playlist','album'].map((k) => [k, Number(byId(k).getMediaSourceId().split(':')[1])]))`)
  const entries = taskbarEntries(Object.values(ids), app.child.pid)
  check('taskbar: one entry for all windows', entries === 1, `${entries} entries`)
  // Another app's window covers all three and is in front.
  const box = await app.ev(`const bs = all.filter((w) => w.isVisible()).map((w) => w.getBounds());
    const x = Math.min(...bs.map((b) => b.x)), y = Math.min(...bs.map((b) => b.y));
    return [x, y, Math.max(...bs.map((b) => b.x + b.width)) - x, Math.max(...bs.map((b) => b.y + b.height)) - y]`)
  const coverUp = async () => {
    const cover = spawn(electron, [join(here, 'cover.cjs'), ...extra, ...box.map(String)], { stdio: ['ignore', 'pipe', 'ignore'] })
    const id = await new Promise((res) => {
      let out = ''
      cover.stdout.on('data', (d) => {
        out += d
        const m = /COVER (\d+)/.exec(out)
        if (m) res(Number(m[1]))
      })
    })
    return { cover, id }
  }
  let { cover, id: coverId } = await coverUp()
  const order = () => stackTopFirst([coverId, ...Object.values(ids)])
  const o1 = order()
  check('raise: cover window starts on top', o1[0] === coverId, fmt(o1))
  // What a taskbar/Dock click does: X11 taskbars ask the window manager to activate the window, Windows switches
  // to it, and macOS activates the app.
  if (process.platform === 'linux') execFileSync('python3', [join(here, 'activate-linux.py'), String(ids.player)])
  else if (process.platform === 'win32') execFileSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', join(here, 'activate-win.ps1'), String(ids.player)])
  else await app.ev(`app.focus({ steal: true })`)
  await sleep(800)
  const o2 = order()
  check('raise: activating the player brings every window above the cover', o2.indexOf(coverId) === 3, fmt(o2) + ' cover ' + coverId)
  cover.kill()
  await sleep(300)
  // The same with a real mouse click on the app's taskbar button / Dock icon (the CI Linux desktop has no taskbar).
  if (process.platform !== 'linux') {
    ;({ cover, id: coverId } = await coverUp())
    check('real click: cover window starts on top', order()[0] === coverId, fmt(order()))
    const [cmd, argv] = process.platform === 'win32'
      ? ['powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', join(here, 'click-taskbar-win.ps1'), '^Electron']] // buttons are named after the app; ours launched first
      : ['swift', [join(here, 'click-dock-mac.swift'), '^Electron$', '0']] // ours launched before the cover, so it comes first
    let out = ''
    try {
      out = execFileSync(cmd, argv).toString()
    } catch (e) {
      out = `exit ${e.status}\n${e.stdout}`
    }
    console.log(out.trim())
    // Ours and the cover each have one button/icon; on Windows ours counts its windows ("Electron - 1 running window").
    check('real click: the app has one taskbar button / Dock icon', /matches: 2\b/.test(out) && !/Electron - [2-9]/.test(out), 'see the list above')
    await sleep(1000)
    const o3 = order()
    check('real click: clicking it brings every window above the cover', o3.indexOf(coverId) === 3, fmt(o3) + ' cover ' + coverId)
    cover.kill()
    await sleep(300)
  }
}
const top = work.y + 2 // a player here has room for one window below it
const bottomY = work.y + work.height - H - 2 // a player here has room for one window above it
// A user drag of window k to an absolute spot.
const dragTo = async (k, x, y) => {
  const b = (await R(app.ev))[k]
  await drag(app.ev, k, x - b.x, y - b.y)
}

// Centre the group (vertically) so the side windows have room.
await dragTo('player', work.x + Math.round((work.width - r.player.width) / 2), work.y + Math.round((work.height - H) / 2))
r = await R(app.ev)
check('player drag: playlist follows on the right', flush.right(r.player, r.playlist) && r.playlist.y === r.player.y, fmt(r))
check('player drag: album follows on the left', flush.left(r.player, r.album) && r.album.y === r.player.y, fmt(r))

// Mid-drag following (not only after the drop).
{
  const b = r.player
  let ok = true
  for (let i = 1; i <= 10; i++) {
    await move(app.ev, 'player', b.x + i * 4, b.y + i)
    await sleep(40)
    const m = await R(app.ev)
    if (!flush.right(m.player, m.playlist) || !flush.left(m.player, m.album)) ok = false
  }
  check('player drag: docked windows follow during the drag', ok)
  await drag(app.ev, 'player', -40, -10, 3)
}

// Tear the playlist off (up to the top, clear of the player): it stays put when the player moves.
r = await R(app.ev)
await dragTo('playlist', r.player.x + r.player.width + 60, top)
r = await R(app.ev)
const loose = r.playlist
await drag(app.ev, 'player', 20, 5)
r = await R(app.ev)
check('tear-off: detached playlist does not follow', r.playlist.x === loose.x && r.playlist.y === loose.y, fmt(r))
check('tear-off: album still follows', flush.left(r.player, r.album), fmt(r))

// Dock the playlist to the player's bottom (dropped 6 px short, offset 90 px so a window docked to its right clears the player); the player sits at the top.
await dragTo('player', work.x + 120, top)
r = await R(app.ev)
await dragTo('playlist', r.player.x + 90, r.player.y + r.player.height + 6)
r = await R(app.ev)
check('bottom: playlist snaps flush below the player', flush.bottom(r.player, r.playlist) && r.playlist.x === r.player.x + 90, fmt(r))
await drag(app.ev, 'player', 40, 4)
r = await R(app.ev)
check('bottom: playlist follows the player, keeping its offset', flush.bottom(r.player, r.playlist) && r.playlist.x === r.player.x + 90, fmt(r))

// Window to window: album docks to the playlist's right (dropped 5 px off), then follows the player through the chain.
await dragTo('album', r.playlist.x + r.playlist.width + 5, r.playlist.y + 6)
r = await R(app.ev)
check('chain: album snaps to the playlist right edge, top aligned', flush.right(r.playlist, r.album) && r.album.y === r.playlist.y, fmt(r))
await drag(app.ev, 'player', 35, 3)
r = await R(app.ev)
check('chain: player drag carries playlist and album', flush.bottom(r.player, r.playlist) && flush.right(r.playlist, r.album), fmt(r))

// Dragging the playlist away (sideways, clear of the player) carries the album docked to it; the player stays.
const p0 = r.player
await dragTo('playlist', r.player.x + r.player.width + 50, r.playlist.y)
r = await R(app.ev)
check('sub-group: album comes along with the playlist', flush.right(r.playlist, r.album), fmt(r))
check('sub-group: player does not move', r.player.x === p0.x && r.player.y === p0.y, fmt(r))
const sub = r.playlist
await drag(app.ev, 'player', -10, 3)
r = await R(app.ev)
check('sub-group: detached group ignores player moves', r.playlist.x === sub.x && r.playlist.y === sub.y, fmt(r))

// A pause mid-drag lets the snap fire (the window jumps flush); dragging on right after must still count as a
// drag, and the final drop snaps where it ends.
{
  await dragTo('player', work.x + 20, top)
  r = await R(app.ev)
  const steps = async (k, x, y, n = 6) => {
    const b = (await R(app.ev))[k]
    for (let i = 1; i <= n; i++) {
      await move(app.ev, k, Math.round(b.x + ((x - b.x) * i) / n), Math.round(b.y + ((y - b.y) * i) / n))
      await sleep(16)
    }
  }
  await steps('album', r.player.x + r.player.width + 6, r.player.y) // 6 px right of the player
  await sleep(180) // the drop timer fires: snaps flush
  await steps('album', r.player.x + 40, r.player.y + r.player.height + 7) // carry on: 7 px below the player
  await sleep(450)
  r = await R(app.ev)
  check('pause mid-drag: the drag goes on and the drop snaps below', flush.bottom(r.player, r.album) && r.album.x === r.player.x + 40, fmt(r))
}

// Top: the player moves to the bottom of the screen (the album below it comes along up to the edge, so tear it off
// first), and the album is dropped 8 px above it.
await dragTo('album', work.x + work.width - H - 20, top)
await dragTo('player', work.x + 20, bottomY)
r = await R(app.ev)
await dragTo('album', r.player.x + 50, r.player.y - H - 8)
r = await R(app.ev)
check('top: album snaps flush above the player', flush.top(r.player, r.album), fmt(r))
await drag(app.ev, 'player', 15, 0)
r = await R(app.ev)
check('top: album follows the player', flush.top(r.player, r.album), fmt(r))

// The player dropped near the detached playlist snaps to it and picks it up.
r = await R(app.ev)
await dragTo('playlist', r.player.x + r.player.width + 120, r.player.y)
await drag(app.ev, 'player', 120 - 7, 0)
r = await R(app.ev)
check('player drop: snaps onto the detached playlist', flush.right(r.player, r.playlist), fmt(r))
check('player drop: album above still docked', flush.top(r.player, r.album), fmt(r))
await drag(app.ev, 'player', -30, 0)
r = await R(app.ev)
check('player drop: playlist now follows', flush.right(r.player, r.playlist), fmt(r))

// Player resize: side windows take the new height and stay flush (room made first: the WM keeps windows on screen).
r = await R(app.ev)
const sizes = { playlist: r.playlist, album: r.album }
const H2 = Math.min(Math.round(H * 1.05), Math.floor((work.height - 6) / 2))
await dragTo('player', work.x + 60, work.y + H2 + 2)
await app.ev(`const w = byId('player'); const b = w.getBounds(); w.setSize(Math.round(${H2} * b.width / b.height), ${H2})`)
await sleep(500)
r = await R(app.ev)
check('resize: playlist keeps its own size and stays flush', r.playlist.height === sizes.playlist.height && flush.right(r.player, r.playlist), fmt(r))
check('resize: album stays flush above', flush.top(r.player, r.album), fmt(r))

// Growing the player against the screen edge: the docked group shifts back onto the screen, still docked (a window
// manager keeps a side window on screen, which used to read as a drag and tear it off, or leave it over the player).
{
  await app.ev(`const w = byId('player'); const b = w.getBounds(); w.setSize(Math.round(308 * b.width / b.height), 308)`)
  await sleep(500)
  r = await R(app.ev)
  await dragTo('player', work.x + work.width - 4 - r.playlist.width - r.player.width, r.player.y)
  r = await R(app.ev)
  const start = r.player
  for (let i = 1; i <= 8; i++) {
    const h = Math.round(308 + ((H2 - 308) * i) / 8)
    await app.ev(`const w = byId('player'); w.setSize(Math.round(${h} * ${start.width / start.height}), ${h})`)
    await sleep(30)
  }
  await sleep(700)
  r = await R(app.ev)
  check('resize at the edge: the group shifts onto the screen', r.playlist.x + r.playlist.width <= work.x + work.width && r.player.x < start.x, fmt(r) + ' work ' + fmt(work))
  check('resize at the edge: still docked and flush', flush.right(r.player, r.playlist) && flush.top(r.player, r.album) && r.playlist.height === sizes.playlist.height, fmt(r))
  await dragTo('player', work.x + 60, r.player.y) // back from the edge for the checks below
}

// Each side window is resized on its own: it keeps its new size and its dock; the player keeps its size.
{
  const before = await R(app.ev)
  const userResize = async (k, b) => {
    await app.ev(`byId('${k}').setBounds(${JSON.stringify(b)})`)
    await sleep(700)
    return R(app.ev)
  }
  const pl = before.playlist
  r = await userResize('playlist', { x: pl.x, y: pl.y, width: pl.width + 30, height: pl.height + 30 }) // its far corner
  check('side resize: the playlist takes its new size, still flush right', r.playlist.width === pl.width + 30 && r.playlist.height === pl.height + 30 && flush.right(r.player, r.playlist) && r.playlist.y === r.player.y, fmt(r))
  check('side resize: the player keeps its size', r.player.width === before.player.width && r.player.height === before.player.height, fmt(r))
  const pl2 = r.playlist
  r = await userResize('playlist', { x: pl2.x + 20, y: pl2.y, width: pl2.width - 20, height: pl2.height - 20 }) // its docked edge
  check('side resize: dragging the docked edge keeps it docked', r.playlist.width === pl2.width - 20 && flush.right(r.player, r.playlist), fmt(r))
  const al = r.album
  r = await userResize('album', { x: al.x, y: al.y, width: al.width - 20, height: al.height - 20 })
  check('side resize: the album above keeps its dock and new size', r.album.height === al.height - 20 && flush.top(r.player, r.album), fmt(r))
  await drag(app.ev, 'player', -20, 0)
  r = await R(app.ev)
  check('side resize: both still follow the player', flush.right(r.player, r.playlist) && flush.top(r.player, r.album), fmt(r))
}

// Size limits: every window has the same height range (308..924) with widths from its own aspect, and a user resize
// ends in proportion and inside the limits.
{
  const lim = await app.ev(`return Object.fromEntries(['player','playlist','album'].map((k) => [k, [...byId(k).getMinimumSize(), ...byId(k).getMaximumSize()]]))`)
  check('limits: player 384x308 to 1151x924', fmt(lim.player) === fmt([384, 308, 1151, 924]), fmt(lim))
  check('limits: side windows 308x308 to 924x924', fmt(lim.playlist) === fmt([308, 308, 924, 924]) && fmt(lim.album) === fmt([308, 308, 924, 924]), fmt(lim))
  const near = (a, b) => Math.abs(a - b) <= 2 // openbox rounds the aspect itself
  const userResize = async (k, b) => {
    await app.ev(`byId('${k}').setBounds(${JSON.stringify(b)})`)
    await sleep(800)
    return R(app.ev)
  }
  let p = (await R(app.ev)).player
  r = await userResize('player', { ...p, width: p.width + 40 }) // its right edge only
  check('proportion: a player width drag ends in proportion', near(r.player.width, p.width + 40) && near(r.player.height, Math.round((p.width + 40) * 616 / 767)) && flush.right(r.player, r.playlist), fmt(r))
  p = r.player
  r = await userResize('player', { ...p, height: p.height - 20 }) // its bottom edge only
  check('proportion: a player height drag ends in proportion', near(r.player.height, p.height - 20) && near(r.player.width, Math.round((p.height - 20) * 767 / 616)), fmt(r))
  const pl = r.playlist
  r = await userResize('playlist', { ...pl, width: pl.width + 24 })
  check('proportion: a side window width drag ends in proportion, still docked', near(r.playlist.width, pl.width + 24) && near(r.playlist.height, r.playlist.width) && flush.right(r.player, r.playlist), fmt(r))
  r = await userResize('playlist', { ...r.playlist, width: 2000, height: 2000 })
  check('limits: a side window never grows past 924', r.playlist.width <= 924 && r.playlist.height <= 924 && near(r.playlist.width, r.playlist.height), fmt(r))
  r = await userResize('playlist', { ...r.playlist, width: 100, height: 100 })
  check('limits: a side window never shrinks below 308', r.playlist.width === 308 && r.playlist.height === 308 && flush.right(r.player, r.playlist), fmt(r))
  await app.ev(`const w = byId('playlist'); w.setSize(${H}, ${H})`) // back to the size the checks below expect
  await sleep(700)
}
const shadeFrom = (await R(app.ev)).playlist

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
check('unshade: playlist back to its size, docked', r.playlist.height === shadeFrom.height && r.playlist.width === shadeFrom.width && flush.right(r.player, r.playlist), fmt(r))
// An OS minimize of a side window shades it instead (it has no taskbar entry), and must not leave it flagged minimized.
await app.ev(`byId('playlist').minimize()`)
await sleep(1500) // macOS animates the minimize before the app can bring the window back
r = await R(app.ev)
// Openbox minimizes a transient window's whole group (the side windows are the player's transients on Linux): that is
// a minimize of the app, and restoring the player (a taskbar click) brings every window back, docked.
if (await app.ev(`return byId('player').isMinimized()`)) {
  console.log('the window manager minimized the whole group')
  await app.ev(`byId('player').restore()`)
  await sleep(1000)
  r = await R(app.ev)
  check('OS minimize (group): restoring the player brings both side windows back, docked', !!r.playlist && !!r.album && flush.right(r.player, r.playlist) && flush.top(r.player, r.album), fmt(r))
  await app.ev(shadeIpc) // shade it, as the rest of the run expects
  await sleep(600)
  r = await R(app.ev)
}
const minFlag = await app.ev(`return byId('playlist').isMinimized()`)
check('OS minimize: shades, stays docked, not stuck minimized', !minFlag && r.playlist?.height < 100 && flush.right(r.player, r.playlist), fmt(r) + ' minimized=' + minFlag)
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
  const dy = 0 // horizontal: the player has a window above it and little room below on small screens
  let samples = 0
  let flushSamples = 0
  let done = false
  // Also check right after each of the app's own move events (Windows' move loop blocks the inspector mid-drag):
  // this listener is added after the app's, so it sees the result of the app's follow.
  await app.ev(`const w = byId('player'); globalThis.__rec = [];
    const f = () => { const p = w.getBounds(), pl = byId('playlist').getBounds(), al = byId('album').getBounds();
      __rec.push(pl.x === p.x + p.width && pl.y < p.y + p.height && p.y < pl.y + pl.height &&
        al.y + al.height === p.y && al.x < p.x + p.width && p.x < al.x + al.width) };
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
  // OS drag thresholds (GTK, Windows, macOS) swallow the first few pixels of the pointer path.
  check('real drag: the OS moved the player', mx >= dx / 2 && Math.abs(my) <= 10, `moved ${mx},${my} from ${fmt(start.player)} at ${fmt(pt)}`)
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
check('restart: side windows keep their own sizes', r.playlist.width === before.playlist.width && r.album.width === before.album.width, fmt(r) + ' before ' + fmt(before))
check('restart: album docked on top again', flush.top(r.player, r.album) && r.album.x - r.player.x === before.album.x - before.player.x, fmt(r) + ' before ' + fmt(before))
await drag(app.ev, 'player', -25, 15)
r = await R(app.ev)
check('restart: both follow the player', flush.right(r.player, r.playlist) && flush.top(r.player, r.album), fmt(r))
void app.ev(`setTimeout(() => app.quit(), 50)`).catch(() => {})
app.ws.close() // --inspect holds the exit until the debugger disconnects
await new Promise((res) => app.child.on('exit', res))

console.log(failures ? `${failures} FAILED` : 'ALL PASS')
process.exit(failures ? 1 : 0)
