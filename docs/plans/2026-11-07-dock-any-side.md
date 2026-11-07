# Plan: Dock any window to any side of any other
Status: Complete

## Goal / Done when / Non-goals
Goal: side windows dock to the player from any side, any window docks to any other, and everything docked to the player (directly or in a chain) stays docked while the player is dragged. Works on Windows, macOS and Linux, with OS-specific fixes where needed.
Done when: pure dock geometry is unit tested; the built app passes a live E2E (scripts/e2e/dock.mjs) covering every side, chains, tear-off, sub-groups, player drop pick-up, resize, shade, OS minimize and restart; pnpm typecheck/lint/test, cargo test and clippy pass.
Non-goals: user-resizable side windows, persisting docks as a separate setting (they are read back from the saved positions), docking on Linux without any X server.

## Design
- `dock.ts` (pure): `snap` (nearest edge within 12 px, start edge aligned), `inferDocks` (BFS from roots: a tree, never a cycle), `layout` (place docked windows from their anchors; `ratio` = offset along the edge, so resizes scale it), `subtree`, `fitGroup` (nudge onto the screen).
- `index.ts`: one `docks` map. `sync()` sizes the side windows to the player's height, lays them out and applies the result (a pure move uses `setPosition`). A user drag of a side window tears it off its dock (its own sub-group follows). On drop, `settle()` snaps and re-infers the docks. A player drop snaps too and picks up loose windows.
- OS fixes: macOS uses child windows for the player's group (no move events during a drag). Linux relaunches once on XWayland (`platform.ts`; AppImage uses `$APPIMAGE`), and `pnpm dev` passes `--ozone-platform=x11`. KWin/X11 leaves restored windows flagged minimized (re-show instead) and pins the minimum size of fixed windows (the shade sets its minimum inside the resizable lift). On Windows, `setPosition` is used for moves (no `setBounds` size drift at fractional scaling).

## Verification
- Red/green: `app/test/dock.test.ts` (16 tests) and `app/test/platform.test.ts` (3 tests).
- Live E2E (`scripts/e2e/dock.mjs`, 34 checks): it drives the built app's main process over `--inspect`, and external `setPosition` steps look like user drags to the app. It also does a real OS pointer drag of the player's body: XTest on Linux (`drag-linux.py`), `SetCursorPos`/`mouse_event` on Windows (`drag-win.ps1`), and CGEvent on macOS (`drag-mac.swift`). Windows are sized from the work area so every layout fits 1024x677 CI screens.
- CI (`.github/workflows/dock-e2e.yml`): Ubuntu (Xvfb + openbox), Windows and macOS runners. The final commit passed all 34 checks on all three, three attempts in a row. Earlier runs found real bugs that are now fixed (each has a check):
  - a two-step X11 configure tore windows off their docks;
  - several in-flight syncs lost the original position;
  - a bogus (0,0) position report from openbox while it reparented a window tore it off; tear-offs are now confirmed 50 ms later;
  - a drag that went on after a mid-drag snap was swallowed (`pause mid-drag` check);
  - macOS dropped a restore during its minimize animation; the restore is now retried.
- Locally (KDE Wayland session, app on XWayland): all checks except the real drag pass. KWin's XWayland ignores XTest input without a portal grant, so the real drag runs only on CI.
- Checked by hand: `appendSwitch('ozone-platform')` from main is too late (the probe window was no X11 client), while the CLI flag works. A plain launch on Wayland relaunches with the flag and its windows appear in `_NET_CLIENT_LIST`. `electron-vite dev -- --ozone-platform=x11` gives X11 windows.
- Not verified: Windows at fractional display scaling (the CI runners use 100%), and the packaged AppImage relaunch (the logic is unit tested; the unpackaged relaunch was checked by hand).
