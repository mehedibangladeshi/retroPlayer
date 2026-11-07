# Plan: Dock any window to any side of any other
Status: Complete

## Goal / Done when / Non-goals
Goal: side windows dock to the player from any side, any window docks to any other, and everything docked to the player (directly or in a chain) stays docked while the player is dragged. Works on Windows, macOS and Linux, with OS-specific fixes where needed.
Done when: pure dock geometry is unit tested; the built app passes a live E2E (scripts/e2e-dock.mjs) covering every side, chains, tear-off, sub-groups, player drop pick-up, resize, shade, OS minimize and restart; pnpm typecheck/lint/test, cargo test and clippy pass.
Non-goals: user-resizable side windows, persisting docks as a separate setting (they are read back from the saved positions), docking on Linux without any X server.

## Design
- `dock.ts` (pure): `snap` (nearest edge within 12 px, start edge aligned), `inferDocks` (BFS from roots: a tree, never a cycle), `layout` (place docked windows from their anchors; `ratio` = offset along the edge, so resizes scale it), `subtree`, `fitGroup` (nudge onto the screen).
- `index.ts`: one `docks` map. `sync()` sizes the side windows to the player's height, lays them out and applies the result (a pure move uses `setPosition`). A user drag of a side window tears it off its dock (its own sub-group follows). On drop, `settle()` snaps and re-infers the docks. A player drop snaps too and picks up loose windows.
- OS fixes: macOS uses child windows for the player's group (no move events during a drag). Linux relaunches once on XWayland (`platform.ts`; AppImage uses `$APPIMAGE`), and `pnpm dev` passes `--ozone-platform=x11`. KWin/X11 leaves restored windows flagged minimized (re-show instead) and pins the minimum size of fixed windows (the shade sets its minimum inside the resizable lift). On Windows, `setPosition` is used for moves (no `setBounds` size drift at fractional scaling).

## Verification
- Red/green: `app/test/dock.test.ts` (16 tests), `app/test/platform.test.ts` (3 tests).
- Live E2E on Linux (KDE Wayland session, app on XWayland): `scripts/e2e-dock.mjs` drives the main process over `--inspect`. External `setPosition` steps look like user drags to the app. 30/30 checks pass on 4 consecutive runs.
- Checked by hand: `appendSwitch('ozone-platform')` from main is too late (the probe window was no X11 client), while the CLI flag works. A plain launch on Wayland relaunches with the flag and its windows appear in `_NET_CLIENT_LIST`. `electron-vite dev -- --ozone-platform=x11` gives X11 windows.
- Not verified: macOS and Windows (no machines here). The macOS child-window path and Windows live-follow are reasoned from Electron's documented behaviour. Run `scripts/e2e-dock.mjs` on both before a release. Real mouse drags were not tested (no xdotool here): the E2E uses external `setPosition` steps.
