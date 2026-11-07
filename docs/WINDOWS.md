# Window behaviour

These are the rules every app window follows. Read this file before you add a window or change any window code
(`app/src/main/index.ts`, `dock.ts`, `shade.ts`, `windowSize.ts`, `platform.ts`, or a view's drag region). A new
window must follow every rule here. A fix or change must not break any rule. To change a rule, ask the user first,
then update this file and add an entry to `docs/DECISIONS.md` in the same commit.

Terms: the **player** is the main window. A **side window** (called a satellite in code) is any other window, today the
playlist (`playlist`) and the album art (`album`). Each window's id in the dock graph is its hash, and the player is `player`.

## Every window

1. Frameless and transparent (`frame: false`, `transparent: true`, `backgroundColor: '#00000000'`). The view draws
   its own chrome from our artwork and clips itself to the artwork's corner radius. No native controls or OS-specific styling.
2. Never full screen or maximized: `maximizable: false`, `fullscreenable: false`, and `on('maximize', () => w.unmaximize())`,
   because Linux ignores `maximizable: false`.
3. Double-click does nothing on any window.
4. Secure renderer: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, the shared preload
   (`../preload/index.cjs`), `setWindowOpenHandler` denies, and `will-navigate` is blocked except for the dev URL.
5. It holds no authoritative state. It renders engine events. Main forwards every engine event to each live window, and it
   resends the state on `did-finish-load`. Main accepts IPC only from the app's own windows (`fromAppWindow`).
   Engine commands are accepted only from windows that need them (today the player and the playlist).
6. Created with `show: false`, then shown on `ready-to-show`.
7. Content size equals window size (`useContentSize: true`). The view scales its fixed design composition to the
   window, so its artwork coordinates stay in design px.

## Side windows

1. Added to the `satellites` list in `app/src/main/index.ts` with its `hash`, `title`, `aspect`, `minWidth`, `minHeight`
   and settings `key`. Everything below then comes from the shared satellite code. Do not write per-window copies of it.
2. Opens at launch with the player (after the player is shown, so it can dock), unless the user hid it.
3. No taskbar or Dock entry of its own: the app has one icon, and activating it (a taskbar or Dock click) brings every
   visible window forward. Side windows are `skipTaskbar: true`, and on Windows and Linux they are always children of the
   player (`parent: win`): Windows gives an owned window no taskbar button and raises it with its owner, and Linux
   taskbars fold a transient window into its main window (KWin ignores `skipTaskbar` for XWayland windows). macOS has
   one Dock icon per app anyway, and there only docked windows are children (a child window moves with its parent).
   Closing it only hides it, and quitting closes it for real. Its bounds are saved under its settings key.
4. Always the player's height (`matchHeight`), with its width from its design aspect ratio. Not user-resizable
   (`resizable: false`): main sets the size. Its `minHeight` must not be more than the player's `MIN_HEIGHT` (308).
5. Exactly one drag region: a childless strip in its top bar, to the left of minimize and close. Nothing else in the
   view sets `-webkit-app-region`. `app/test/dragRegions.test.ts` enforces this, so add the new view to that test.
6. Minimize does not minimize. It rolls the window up into its top bar (the window shade) and back. It needs a `SHADE`
   entry (design width and top-bar height) in `app/src/shared/shade.ts`. If the OS minimizes it anyway, main brings it back and shades it. If the window manager minimizes the player
   with it (openbox minimizes a transient window's whole group), that is a minimize of the app, and restoring the player brings it back.
7. Minimizing the player hides the visible side windows, and restoring the player shows them again.
8. Closing the player saves every window's bounds, then closes them all.

## Docking

1. Any window docks to any side (left, right, top, bottom) of any other window. Docks form a tree rooted at the
   player: `Dock { to, side, ratio }`, where the ratio is the offset along the shared edge.
2. Windows docked to a window follow it, so everything docked to the player, directly or through a chain, moves
   with the player, live while it is dragged.
3. A window dropped within `SNAP_PX` (12 px) of another window's edge snaps flush. Its start edge also aligns if that
   is within 12 px too.
4. Dragging a docked side window tears it off its dock. Windows docked to it come along. Dropping the player near
   a loose window snaps the player to it and picks the window up.
5. A side window never ends up over the player. If it is saved over the player, it is docked back to its default side.
6. Docks are not saved. They are rebuilt from the window positions (`inferDocks`) after every drop and at startup, so
   a layout survives a restart. A new window needs an entry in `DEFAULT_DOCKS` to set where it docks by default.
7. A shaded window stays docked, and windows docked below it move up.
8. When a side window is shown, the player's group is nudged onto the screen, unless that would push the player onto a loose window.
9. Pure geometry lives in `app/src/main/dock.ts` and is unit-tested in `app/test/dock.test.ts`. Window code calls it.
   Do not put geometry in `index.ts`.

## OS rules (keep these when you change window code)

- **Own moves vs user drags:** the app records every position it sets or leaves, and ignores move and resize events
  at those positions for 1 s (`programmatic` / `isOwn`). Every programmatic move must go through these helpers
  (`setRect`, `resizeFixed`, `sync`), or the app will read its own move as a user drag.
- **Tear-off is confirmed 50 ms later**, because openbox briefly reports (0,0) while it reparents a window.
- **Windows:** use `setPosition` for a pure move, because `setBounds` can drift the size at fractional scaling.
- **macOS:** no move events arrive during a drag, so docked windows become the player's child windows
  (`setParentWindow`). A side window that macOS minimizes is restored with retries.
- **Linux:** native Wayland gives apps no window positions, so the app runs on XWayland (`--ozone-platform=x11`: a one-time
  relaunch in `app/src/main/platform.ts`, passed directly by `pnpm dev`). On KWin under X11, re-show a side window
  with hide and `showInactive` instead of `restore()`. Set a fixed window's size inside `resizeFixed`, which lifts
  the resize lock and sets the minimum size.

## Checklist for a new window

- [ ] A failing test first (TDD rule), then the window.
- [ ] Every window rule and every side-window rule above holds.
- [ ] It is in `satellites`, `DEFAULT_DOCKS`, `SHADE`, `Settings`, and the `fromAppWindow` / `Sidecar` window lists.
- [ ] Its view is covered by `app/test/dragRegions.test.ts`.
- [ ] `scripts/e2e/dock.mjs` covers it: it docks on each side, follows a player drag, tears off and snaps back, has no
      taskbar entry of its own, and comes forward when the player is activated.
      Run the script locally and on CI (`.github/workflows/dock-e2e.yml`) on Linux, Windows and macOS.
- [ ] `docs/ARCHITECTURE.md` and this file are updated if anything changed.
