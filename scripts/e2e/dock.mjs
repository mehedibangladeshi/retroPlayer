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

// `want`: how many windows must be up (side windows closed in a previous run stay closed).
async function launch(port, want = 5) {
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
        const byId = (k) => all.find((w) => k === 'player' ? !/#(playlist|album|rack|power)/.test(w.webContents.getURL()) : w.webContents.getURL().endsWith('#' + k));
        ${expr} })()`
      ws.send(JSON.stringify({ id: i, method: 'Runtime.evaluate', params: { expression: body, awaitPromise: true, returnByValue: true } }))
    })
  // Slow first launches (macOS runners): wait until the player and the side windows are up.
  let up = 0
  for (let i = 0; i < 200 && up < want; i++) {
    await sleep(200)
    up = await ev(`return all.filter((w) => w.isVisible()).length`).catch(() => 0)
  }
  if (up < want) throw new Error('windows not up: ' + JSON.stringify(await ev(`return all.map((w) => [w.webContents.getURL(), w.isVisible()])`)))
  return { child, ev, ws }
}

const R = (ev) => ev(`return Object.fromEntries(['player','playlist','album','rack','power'].map((k) => [k, byId(k)?.isVisible() ? byId(k).getBounds() : null]))`)
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
const mins = await app.ev(`return Object.fromEntries(['playlist','album','rack','power'].map((k) => [k, byId(k).getMinimumSize()]))`)
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
check('every window is user-resizable', await app.ev(`return ['player','playlist','album','rack','power'].every((k) => byId(k).isResizable())`))
// The checks below expect every window at the player's height: resize the side windows to it, as a user would.
await app.ev(`for (const k of ['playlist', 'album']) { const w = byId(k); const b = w.getBounds(); w.setSize(Math.round(${H} * b.width / b.height), ${H}) }`)
await sleep(700)
r = await R(app.ev)
check('side resize: both side windows take the new height, still docked', r.playlist.height === H && r.album.height === H && flush.right(r.player, r.playlist) && flush.left(r.player, r.album), fmt(r))

// The cassette rack: docked above the player, it follows, shades, tears off and snaps back, and resizes in proportion
// within its limits. Then it is closed (hidden), so the checks below keep their three-window layout.
{
  const RK = 1623 / 936
  const nearR = (a, b) => Math.abs(a - b) <= 2
  check('rack startup: docked above the player at the player height', flush.top(r.player, r.rack) && atPlayerHeight('rack'), fmt(r0) + ' min ' + fmt(mins))
  await app.ev(`const w = byId('rack'); w.setSize(${Math.round(H * RK)}, ${H})`)
  await sleep(700)
  r = await R(app.ev)
  check('rack resize: takes the new height, still docked above', r.rack.height === H && flush.top(r.player, r.rack), fmt(r))
  // Room above the player for the rack: the player just below the top of the work area.
  await drag(app.ev, 'player', work.x + Math.round((work.width - r.player.width) / 2) - r.player.x, work.y + H + 50 - r.player.y)
  r = await R(app.ev)
  check('rack: follows a player drag', flush.top(r.player, r.rack) && r.rack.x === r.player.x, fmt(r))
  const lim = await app.ev(`const w = byId('rack'); return [...w.getMinimumSize(), ...w.getMaximumSize()]`)
  check('rack limits: 534x308 to 1602x924', fmt(lim) === fmt([534, 308, 1602, 924]), fmt(lim))
  const rackShade = `const { ipcMain } = process.mainModule.require('electron'); const w = byId('rack'); ipcMain.emit('window:toggleShade', { sender: w.webContents, senderFrame: w.webContents.mainFrame })`
  const full = r.rack
  await app.ev(rackShade)
  await sleep(600)
  r = await R(app.ev)
  check('rack shade: rolls up to its bar, still docked above', r.rack.height < 100 && flush.top(r.player, r.rack), fmt(r))
  await app.ev(rackShade)
  await sleep(600)
  r = await R(app.ev)
  check('rack unshade: back to its size, docked', r.rack.width === full.width && r.rack.height === full.height && flush.top(r.player, r.rack), fmt(r))
  await drag(app.ev, 'rack', 160, -30) // clear of the snap distance (12 px)
  r = await R(app.ev)
  const torn = r.rack
  check('rack tear-off: leaves the player', !flush.top(r.player, r.rack), fmt(r))
  await drag(app.ev, 'player', 0, 6)
  r = await R(app.ev)
  check('rack tear-off: a loose rack does not follow', r.rack.x === torn.x && r.rack.y === torn.y, fmt(r))
  await drag(app.ev, 'rack', r.player.x + 4 - r.rack.x, r.player.y - r.rack.height - 6 - r.rack.y)
  r = await R(app.ev)
  check('rack snap: dropped 6 px above, snaps flush and aligns', flush.top(r.player, r.rack) && r.rack.x === r.player.x, fmt(r))
  const rk = r.rack
  await app.ev(`byId('rack').setBounds(${JSON.stringify({ ...rk, width: rk.width + 40 })})`)
  await sleep(800)
  r = await R(app.ev)
  check('rack proportion: a width drag ends in proportion, still docked', nearR(r.rack.width, Math.round(r.rack.height * RK)) && flush.top(r.player, r.rack), fmt(r) + ' from ' + fmt(rk))
  await app.ev(`byId('rack').setSize(${Math.round(H * RK)}, ${H})`) // back to the player height: it reopens above the player later
  await sleep(700)
  await app.ev(`byId('rack').close()`)
  await sleep(500)
  r = await R(app.ev)
  check('rack close: hides it, the app keeps running', r.rack === null && !!r.player, fmt(r))
}

// The power deck: docked right of the playlist (so it follows the player through it), it shades, tears off and snaps
// back, and resizes in proportion within its limits. Then it is closed (hidden) like the rack.
{
  const PD = 451 / 934
  const nearR = (a, b) => Math.abs(a - b) <= 2
  check('power startup: docked right of the playlist at the player height', flush.right(r0.playlist, r0.power) && r0.power.y === r0.playlist.y && atPlayerHeight('power'), fmt(r0) + ' min ' + fmt(mins))
  await app.ev(`const w = byId('power'); w.setSize(${Math.round(H * PD)}, ${H})`)
  await sleep(700)
  r = await R(app.ev)
  // The deck is about 1:2, so a 1 px width rounding moves the proportional height by about 2 px.
  check('power resize: takes the new height, still docked', Math.abs(r.power.height - H) <= 2 && flush.right(r.playlist, r.power), fmt(r))
  await drag(app.ev, 'player', -40, 20)
  r = await R(app.ev)
  check('power: follows a player drag through the playlist', flush.right(r.player, r.playlist) && flush.right(r.playlist, r.power) && r.power.y === r.playlist.y, fmt(r))
  const lim = await app.ev(`const w = byId('power'); return [...w.getMinimumSize(), ...w.getMaximumSize()]`)
  check('power limits: 149x308 to 446x924', fmt(lim) === fmt([149, 308, 446, 924]), fmt(lim))
  const shade = `const { ipcMain } = process.mainModule.require('electron'); const w = byId('power'); ipcMain.emit('window:toggleShade', { sender: w.webContents, senderFrame: w.webContents.mainFrame })`
  const full = r.power
  await app.ev(shade)
  await sleep(600)
  r = await R(app.ev)
  check('power shade: rolls up to its bar, still docked', r.power.height < 60 && r.power.width === full.width && flush.right(r.playlist, r.power), fmt(r))
  await app.ev(shade)
  await sleep(600)
  r = await R(app.ev)
  check('power unshade: back to its size, docked', r.power.width === full.width && r.power.height === full.height && flush.right(r.playlist, r.power), fmt(r))
  await drag(app.ev, 'power', 40, 60) // clear of the snap distance (12 px)
  r = await R(app.ev)
  const torn = r.power
  check('power tear-off: leaves the playlist', !flush.right(r.playlist, r.power), fmt(r))
  await drag(app.ev, 'player', 0, 6)
  r = await R(app.ev)
  check('power tear-off: a loose power deck does not follow', r.power.x === torn.x && r.power.y === torn.y, fmt(r))
  await drag(app.ev, 'power', r.playlist.x + r.playlist.width + 6 - r.power.x, r.playlist.y + 4 - r.power.y)
  r = await R(app.ev)
  check('power snap: dropped 6 px right of the playlist, snaps flush and aligns', flush.right(r.playlist, r.power) && r.power.y === r.playlist.y, fmt(r))
  const pd = r.power
  await app.ev(`byId('power').setBounds(${JSON.stringify({ ...pd, width: pd.width + 40 })})`)
  await sleep(800)
  r = await R(app.ev)
  check('power proportion: a width drag ends in proportion, still docked', nearR(r.power.width, Math.round(r.power.height * PD)) && flush.right(r.playlist, r.power), fmt(r) + ' from ' + fmt(pd))
  await app.ev(`byId('power').close()`)
  await sleep(500)
  r = await R(app.ev)
  check('power close: hides it, the app keeps running', r.power === null && !!r.player, fmt(r))
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
  // Openbox enforces the aspect itself and may keep the other dimension, so only the proportion is checked here (which
  // dimension leads is unit-tested in windowSize.test.ts).
  const inProportion = (b) => near(b.width, Math.round((b.height * 767) / 616))
  const userResize = async (k, b) => {
    await app.ev(`byId('${k}').setBounds(${JSON.stringify(b)})`)
    await sleep(800)
    return R(app.ev)
  }
  let p = (await R(app.ev)).player
  r = await userResize('player', { ...p, width: p.width + 40 }) // its right edge only
  check('proportion: a player width drag ends in proportion', inProportion(r.player) && r.player.width !== p.width && flush.right(r.player, r.playlist), fmt(r) + ' from ' + fmt(p))
  p = r.player
  r = await userResize('player', { ...p, height: p.height - 20 }) // its bottom edge only
  check('proportion: a player height drag ends in proportion', inProportion(r.player) && flush.right(r.player, r.playlist), fmt(r) + ' from ' + fmt(p))
  const pl = r.playlist
  r = await userResize('playlist', { ...pl, width: pl.width + 24 })
  check('proportion: a side window width drag ends in proportion, still docked', near(r.playlist.height, r.playlist.width) && flush.right(r.player, r.playlist), fmt(r) + ' from ' + fmt(pl))
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

// The five-window layout: the rack above the player, the playlist right of it with the power deck on its right, and
// the album above the playlist (clear of the rack). The playlist is unshaded and the player set back to height H first.
const toggleShade = (k) => app.ev(`const { ipcMain } = process.mainModule.require('electron'); const w = byId('${k}'); ipcMain.emit('window:toggleShade', { sender: w.webContents, senderFrame: w.webContents.mainFrame })`)
const fiveDocked = (m) => flush.top(m.player, m.rack) && m.rack.x === m.player.x && flush.right(m.player, m.playlist) && flush.right(m.playlist, m.power) && m.power.y === m.playlist.y && flush.top(m.playlist, m.album)
await toggleShade('playlist')
await app.ev(`const w = byId('player'); const b = w.getBounds(); w.setSize(Math.round(${H} * b.width / b.height), ${H})`)
await sleep(700)
r = await R(app.ev)
await dragTo('player', work.x + 10, work.y + H + 2)
r = await R(app.ev)
{
  const rackW = await app.ev(`return byId('rack').getBounds().width`) // hidden: R() reports null
  await dragTo('album', r.player.x + rackW + 16, r.playlist.y - r.album.height - 6)
  r = await R(app.ev)
  check('layout: album snaps above the playlist, clear of where the rack docks', flush.top(r.playlist, r.album) && r.album.x >= r.player.x + rackW + 10, fmt(r))
}

// The player's right-click menu, live: the real 'context-menu' handler builds it; popup() is intercepted so the menu is
// captured instead of shown. `click` picks the submenu item with that label.
const menu = (click = '') => app.ev(`const { Menu } = process.mainModule.require('electron'); const orig = Menu.prototype.popup; let m;
  Menu.prototype.popup = function () { m = this }
  try { byId('player').webContents.emit('context-menu', { preventDefault() {} }, {}) } finally { Menu.prototype.popup = orig }
  const items = m.items[0].submenu.items; items.find((i) => i.label === ${JSON.stringify(click)})?.click()
  return items.map((i) => [i.label, i.checked])`)
const hiddenSaved = () => app.ev(`const fs = process.mainModule.require('fs'), path = process.mainModule.require('path');
  return JSON.parse(fs.readFileSync(path.join(app.getPath('userData'), 'settings.json'), 'utf8')).hiddenWindows ?? []`)
{
  const hashOf = { Playlist: 'playlist', Album: 'album', 'Cassette Rack': 'rack', 'Power Deck': 'power' }
  const marksMatch = (items, v) => items.length === 4 && items.every(([l, c]) => hashOf[l] && c === !!v[hashOf[l]])
  let items = await menu()
  r = await R(app.ev)
  check('menu: lists the four side windows, checked when visible', marksMatch(items, r) && r.rack === null && r.power === null, fmt(items))
  let hid = await hiddenSaved()
  check('menu: the closed rack and power deck are saved hidden', hid.includes('rack') && hid.includes('power'), fmt(hid))
  await menu('Cassette Rack')
  await sleep(1000)
  r = await R(app.ev)
  check('menu: Cassette Rack shows it docked above the player', !!r.rack && flush.top(r.player, r.rack) && r.rack.x === r.player.x, fmt(r))
  await menu('Power Deck')
  await sleep(1000)
  r = await R(app.ev)
  check('menu: Power Deck shows it docked right of the playlist', !!r.power && flush.right(r.playlist, r.power) && r.power.y === r.playlist.y, fmt(r))
  hid = await hiddenSaved()
  check('menu: shown windows are no longer saved hidden', !hid.includes('rack') && !hid.includes('power'), fmt(hid))
  items = await menu()
  check('menu: all four checked once visible', marksMatch(items, r) && items.every(([, c]) => c), fmt(items))
  const al = r.album
  await menu('Album')
  await sleep(800)
  r = await R(app.ev)
  hid = await hiddenSaved()
  check('menu: Album hides it and saves it hidden', r.album === null && hid.includes('album'), fmt(r) + ' ' + fmt(hid))
  check('menu: its mark clears', marksMatch(await menu(), r), '')
  await menu('Album')
  await sleep(1000)
  r = await R(app.ev)
  hid = await hiddenSaved()
  check('menu: Album shows it again, docked where it was', !!r.album && r.album.x === al.x && r.album.y === al.y && flush.top(r.playlist, r.album) && !hid.includes('album'), fmt(r) + ' was ' + fmt(al) + ' ' + fmt(hid))
  check('menu: all five windows docked', fiveDocked(r), fmt(r))
}

// One taskbar/dock icon for the app, and activating it (it activates the player) brings every window forward.
{
  const ids = await app.ev(`return Object.fromEntries(['player','playlist','album','rack','power'].map((k) => [k, Number(byId(k).getMediaSourceId().split(':')[1])]))`)
  const entries = taskbarEntries(Object.values(ids), app.child.pid)
  check('taskbar: one entry for all windows', entries === 1, `${entries} entries`)
  // Another app's window covers all five and is in front.
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
  check('raise: activating the player brings every window above the cover', o2.indexOf(coverId) === Object.keys(ids).length, fmt(o2) + ' cover ' + coverId)
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
    check('real click: clicking it brings every window above the cover', o3.indexOf(coverId) === Object.keys(ids).length, fmt(o3) + ' cover ' + coverId)
    cover.kill()
    await sleep(300)
  }
}

// An OS minimize of the rack shades it instead, like the playlist; then a shaded rack and power deck follow the player.
{
  const full = await R(app.ev)
  await app.ev(`byId('rack').minimize()`)
  await sleep(1500) // macOS animates the minimize before the app can bring the window back
  r = await R(app.ev)
  if (await app.ev(`return byId('player').isMinimized()`)) {
    console.log('the window manager minimized the whole group')
    await app.ev(`byId('player').restore()`)
    await sleep(1000)
    r = await R(app.ev)
    check('rack OS minimize (group): restoring the player brings all four side windows back, docked', fiveDocked(r), fmt(r))
    await toggleShade('rack') // shade it, as the rest of the run expects
    await sleep(600)
    r = await R(app.ev)
  }
  const minFlag = await app.ev(`return byId('rack').isMinimized()`)
  check('rack OS minimize: shades, stays docked, not stuck minimized', !minFlag && r.rack?.height < 100 && flush.top(r.player, r.rack), fmt(r) + ' minimized=' + minFlag)
  await toggleShade('power')
  await sleep(600)
  await drag(app.ev, 'player', 20, 0)
  r = await R(app.ev)
  check('shade: shaded rack and power deck follow', r.rack.height < 100 && r.power.height < 60 && flush.top(r.player, r.rack) && r.rack.x === r.player.x && flush.right(r.playlist, r.power), fmt(r))
  await toggleShade('rack')
  await toggleShade('power')
  await sleep(700)
  await drag(app.ev, 'player', -20, 0)
  r = await R(app.ev)
  check('unshade: rack and power deck back to their size, docked', r.rack.height === full.rack.height && r.power.height === full.power.height && fiveDocked(r), fmt(r) + ' was ' + fmt(full))
}

// A real OS pointer drag on the player's body (not a button): the window manager moves it, all four docked windows follow.
{
  const pt = await app.ev(`const w = byId('player'); const c = w.getContentBounds();
    const p = await w.webContents.executeJavaScript(\`(() => { const cp = document.querySelector('.cp'); const r = cp.getBoundingClientRect();
      for (let y = r.top + 40; y < r.bottom - 20; y += 8) for (let x = r.left + 40; x < r.right - 20; x += 8) {
        const e = document.elementFromPoint(x, y); if (e && cp.contains(e) && !e.closest('button, .cp-menu')) return { x, y } } return null })()\`);
    return p && { x: c.x + p.x, y: c.y + p.y, scale: screen.getDisplayMatching(c).scaleFactor }`)
  const start = await R(app.ev)
  const dx = 100 // the five-window group is about 2.7 player heights wide: room for this on a 1024 px screen
  const dy = 0 // horizontal: the player has windows above it and little room below on small screens
  let samples = 0
  let flushSamples = 0
  let done = false
  // Also check right after each of the app's own move events (Windows' move loop blocks the inspector mid-drag):
  // this listener is added after the app's, so it sees the result of the app's follow.
  await app.ev(`const w = byId('player'); globalThis.__rec = [];
    const f = () => __rec.push(Object.fromEntries(['player','playlist','album','rack','power'].map((k) => [k, byId(k).getBounds()])));
    w.on('move', f); globalThis.__recOff = () => w.off('move', f)`)
  const dragging = realDrag(pt.x, pt.y, dx, dy, pt.scale).finally(() => (done = true))
  while (!done) {
    const m = await R(app.ev)
    if (m.player.x !== start.player.x || m.player.y !== start.player.y) {
      samples++
      if (fiveDocked(m)) flushSamples++
    }
    await sleep(40)
  }
  await dragging
  await sleep(500)
  const rec = await app.ev(`__recOff(); return __rec`)
  samples += rec.length
  flushSamples += rec.filter(fiveDocked).length
  r = await R(app.ev)
  const mx = r.player.x - start.player.x
  const my = r.player.y - start.player.y
  // OS drag thresholds (GTK, Windows, macOS) swallow the first few pixels of the pointer path.
  check('real drag: the OS moved the player', mx >= dx / 2 && Math.abs(my) <= 10, `moved ${mx},${my} from ${fmt(start.player)} at ${fmt(pt)}`)
  check('real drag: docked windows flush after the drop', fiveDocked(r), fmt(r))
  check('real drag: docked windows follow during the drag', samples > 0 && flushSamples / samples >= 0.8, `${flushSamples}/${samples} mid-drag samples flush`)
}

const quit = async () => {
  void app.ev(`setTimeout(() => app.quit(), 50)`).catch(() => {})
  app.ws.close() // --inspect holds the exit until the debugger disconnects
  await new Promise((res) => app.child.on('exit', res))
}
// Quit (saves settings), relaunch: docks come back from the saved positions.
const before = await R(app.ev)
await quit()
app = await launch(9342, 5)
r = await R(app.ev)
const sameOffset = (k, to) => r[k].x - r[to].x === before[k].x - before[to].x && r[k].y - r[to].y === before[k].y - before[to].y
check('restart: playlist docked right again', flush.right(r.player, r.playlist), fmt(r))
check('restart: side windows keep their own sizes', ['playlist', 'album', 'rack', 'power'].every((k) => r[k].width === before[k].width && r[k].height === before[k].height), fmt(r) + ' before ' + fmt(before))
check('restart: album docked on top of the playlist again', flush.top(r.playlist, r.album) && sameOffset('album', 'playlist'), fmt(r) + ' before ' + fmt(before))
check('restart: rack docked above the player again', flush.top(r.player, r.rack) && sameOffset('rack', 'player'), fmt(r) + ' before ' + fmt(before))
check('restart: power deck docked right of the playlist again', flush.right(r.playlist, r.power) && sameOffset('power', 'playlist'), fmt(r) + ' before ' + fmt(before))
await drag(app.ev, 'player', -25, 15)
r = await R(app.ev)
check('restart: all four follow the player', fiveDocked(r), fmt(r))
// Closed side windows stay closed at the next launch.
await app.ev(`byId('rack').close(); byId('power').close()`)
await sleep(500)
await quit()
app = await launch(9343, 3)
r = await R(app.ev)
check('restart: closed side windows stay closed', r.rack === null && r.power === null && !!r.playlist && !!r.album, fmt(r))
await quit()

console.log(failures ? `${failures} FAILED` : 'ALL PASS')
process.exit(failures ? 1 : 0)
