# Window behaviour

These are the rules every app window follows. Read this file before you add a window or change any window code
(`app/src/main/index.ts`, `dock.ts`, `shade.ts`, `windowSize.ts`, `platform.ts`, or a view's drag region). A new
window must follow every rule here. A fix or change must not break any rule. To change a rule, ask the user first,
then update this file and add an entry to `docs/DECISIONS.md` in the same commit.

Terms: the **player** is the main window. A **side window** (called a satellite in code) is any other window, today the
playlist (`playlist`), the album art (`album`), the cassette rack (`rack`) and the power deck (`power`). Each window's id in the dock graph is its hash, and the player is `player`.

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
   window, so its artwork coordinates stay in design px. A free window (rule 8) scales by its tighter side and grows the
   composition to fill the rest (`stretchFit`): its art layers are drawn nine-slice (`nineSlice`, borders in `SLICE` in
   `layout.ts`) so the corners keep the title, buttons, lamps and grip, and only plain frame stretches. Text may keep a
   fixed screen size instead: the playlist divides `PLAYLIST.TEXT_PX` by its scale (`textMetrics` in `playlistText.ts`). Side-window chrome is the exception: it is drawn at a fixed scale (see Chrome scale).
8. User-resizable within limits that depend on the display the window is on. With `H` the work-area height of that
   display: the height stays within `minHeight = 200` (flat, so small screens work) and
   `maxHeight = max(200, min(round(0.90·H), 2 × the window's design height))`, and the width within the widths its
   design aspect gives at those heights (`displayLimits` in `windowSize.ts`, passed as the window's min and max size). Every window's minimum height is the same 200, so docked windows can always line up with the player; the playlist and the rack take only their minimum widths from `app/src/shared/freeMin.ts` (220 and 330 DIP).
   With no saved bounds, or saved bounds that no longer fit the display's work area (`fitsWorkArea`), a window opens
   at `initialHeight` (about 60% of `H`, never above its design height, aspect kept). The default player height (`defaultPlayerHeight`) fits the default five-window group in 75% of the primary work area.
   Limits are re-applied on display metrics changes, display added or removed, and when a window's move ends on another
   display. A window now out of range is clamped (`clampToLimits`, aspect kept) and stays docked. A shaded window is not
   resized; its limits apply when it is unshaded. The numbers and sources are in `docs/DECISIONS.md`. The player, album and power deck keep their design
   aspect (`setAspectRatio`). An X11 window manager (KWin) does not enforce the aspect on an edge resize, so when a user
   resize ends the window is brought back in proportion (`proportional`): the dimension the user changed most leads,
   and the edge the user moved stays put. The playlist and the cassette rack are **free** (`free: true` in
   `satellites`): their width and height change independently, with no aspect lock and no proportion fix.

## Side windows

1. Added to the `satellites` list in `app/src/main/index.ts` with its `hash`, `title`, `aspect`, `free`, size limits
   (`...displayLimits(...)`, rule 8 above) and settings `key`. Everything below then comes from the shared satellite code. Do not write per-window copies of it.
2. Opens at launch with the player (after the player is shown, so it can dock), unless the user hid it.
3. No taskbar or Dock entry of its own: the app has one icon, and activating it (a taskbar or Dock click) brings every
   visible window forward. Side windows are `skipTaskbar: true`, and on Windows and Linux they are always children of the
   player (`parent: win`): Windows gives an owned window no taskbar button and raises it with its owner, and Linux
   taskbars fold a transient window into its main window (KWin ignores `skipTaskbar` for XWayland windows). macOS has
   one Dock icon per app anyway, and there only docked windows are children (a child window moves with its parent).
   Closing it only hides it, and quitting closes it for real. Its bounds are saved under its settings key.
4. User-resizable on its own (`resizable: true`), keeping its design aspect ratio (`setAspectRatio`) unless it is free
   (rule 8 above). It opens at the player's height and its design shape the first time (`matchHeight`), then at its
   saved size. A shaded window's bar is drawn at the fixed chrome scale (see Chrome scale).
   Resizing the player never resizes it. Resizing one window leaves the others alone, unless the windows are locked
   (see Window lock). A docked window keeps its dock while it is resized: it is placed back 2 px from
   its anchor (a drag on its docked edge grows it the other way), and windows docked to it follow. A shaded
   window is not resizable.
5. Exactly one drag region: a childless strip in its top bar, to the left of minimize and close. Nothing else in the
   view sets `-webkit-app-region`, except the empty body of the album and power windows while the windows are locked
   (see Window lock). `app/test/dragRegions.test.ts` enforces this, so add the new view to that test.
6. Minimize does not minimize. It rolls the window up into its top bar (the window shade) and back. It needs a `SHADE`
   entry (design width and top-bar height) in `app/src/shared/shade.ts`. If the OS minimizes it anyway, main brings it back and shades it. If the window manager minimizes the player
   with it (openbox minimizes a transient window's whole group), that is a minimize of the app, and restoring the player brings it back.
7. Minimizing the player hides the visible side windows, and restoring the player shows them again.
8. Closing the player saves every window's bounds, then closes them all.
9. Closing a side window only hides it. A right-click anywhere on the player opens a native menu, built only from the
   page's `context-menu` event on every OS (`app/src/main/contextMenu.ts`). Its Windows submenu lists every side window
   with a checkmark for visible, a separator, `Reset Windows`, `Fill Gaps` and, last, `Lock Windows` (see Window lock). Picking a window shows or hides it.
   Its Keyboard Shortcuts submenu lists every shortcut with its key, for display only (the windows handle the keys).
   Closed windows are saved (`hiddenWindows` in settings.json) and stay closed at the next launch until shown again.
   The cassette rack has its own native right-click menu (Sort: Recent / Sort: Custom, Remove from rack over a
   spine, and `Clear cassette rack…`, disabled when the rack is empty; it asks first and drops the saved progress,
   see `docs/ARCHITECTURE.md`, Rack history). The rack page asks for it over `rack:menu` with the spine under the pointer; main pops it on the rack window.
   On Windows and Linux, `system-context-menu` comes first on a right-click over a drag region. It is only
   `preventDefault()`ed to hide the OS window menu and never opens a menu: a menu popped from it closed about 5 ms
   later on Linux, and two back to back left none open on Windows.
10. `Windows → Reset Windows` does what a first launch does: all four side windows are shown and unshaded,
    `hiddenWindows` is cleared, the player goes to its default size on its display, the side windows go to the player's
    height, `DEFAULT_DOCKS` applies, the group is nudged onto the work area, and the bounds are saved once every window is shown.

## Docking

1. Any window docks to any side (left, right, top, bottom) of any other window. Docks form a tree rooted at the
   player: `Dock { to, side, ratio }`, where the ratio is the offset along the shared edge.
2. Windows docked to a window follow it, so everything docked to the player, directly or through a chain, moves
   with the player, live while it is dragged.
3. A window dropped within `SNAP_PX` (12 px) of another window's edge snaps to a 2 px gap from it (rule 10). Its start or end edge also aligns
   with that window's, whichever is closer, if that is within 12 px too (`snap`).
3a. Tiling: when a user resize ends, each edge it moved snaps to a parallel edge of another window within 12 px
   (`snapResize` in `dock.ts`), leaving the 2 px gap. A free window snaps each edge on its own. An aspect window snaps by the dimension the
   user changed most. This runs at resize end on every OS, because `will-resize` does not exist on Linux.
3b. `Windows → Fill Gaps` (`fillGaps`) is on demand, never automatic. Inside the bounding box of the player's visible
   group, each visible free window grows right, down, left, then up into empty space, until it stops at the 2 px gap from another window
   (a shaded bar counts) or the box edge, within its limits. Aspect windows never change.
4. Dragging a docked side window tears it off its dock, unless the windows are locked (see Window lock). Windows docked to it come along. Dropping the player near
   a loose window snaps the player to it and picks the window up.
5. A side window never ends up over the player. If it is saved over the player, it is docked back to its default side.
6. Docks are not saved. They are rebuilt from the window positions (`inferDocks`) after every drop and at startup, so
   a layout survives a restart. A new window needs an entry in `DEFAULT_DOCKS` to set where it docks by default.
7. A shaded window stays docked, and windows docked below it move up.
8. When a side window is shown, and after a user resize, the player's group is nudged onto the screen, unless
   that would push the player onto a loose window. A window manager ignores the nudge while the user still holds the
   window, so it is retried every 250 ms until the group fits (`fitSoon`).
9. Pure geometry lives in `app/src/main/dock.ts` and is unit-tested in `app/test/dock.test.ts`. Window code calls it.
   Do not put geometry in `index.ts`.
10. Attached windows are 2 px apart. `GAP = 2` in `dock.ts` is in DIP, so the gap is the same at any display scaling.
    Snap, place, layout, `snapResize` and `fillGaps` all leave exactly that gap, including at the corners where three
    windows meet. Dock inference accepts windows 0 to 3 px apart, so an older flush layout re-docks and gets the gap.
    The windows are transparent, so the desktop shows through the gap. A detached window has no gap rule.

## Chrome scale

Side-window chrome (the title bar, its title and icons, the frame and the border) is drawn at one fixed scale,
`CHROME_SCALE = 0.55` in `app/src/shared/chrome.ts`, so it keeps its size when the window is resized. Before, each view
drew its whole design composition, title bar included, inside one `scale(fit)` transform that followed the window size.
1. Album and power: the composition is split at design y = `barH`. The bar is drawn at `CHROME_SCALE` and nine-sliced to
   the window width. The body below scales with the window (`winW / designW`). The window keeps
   `w / (h − extraH) = designW / (designH − barH)`, with `extraH = barH · 0.55`. On macOS this is `setAspectRatio` with
   `extraSize`. On Windows and Linux a whole-window aspect lock is refreshed for each height, with a correction at resize
   end, so a long drag can jump slightly at the end.
2. Playlist and rack: their nine-slice frame art also holds the paper and cover edges, so the whole window is drawn at
   `CHROME_SCALE`, and resizing shows more or less area instead of enlarging the art. This is the owner's choice over
   misaligned frames or new art.
3. A shaded window's bar is `round(barH · 0.55)` tall at any size.
4. The player is unchanged, because its bezel is product art, not chrome.

Limitation: the power window's side and bottom border is baked into its body art, so it still scales. Only its title bar
is fixed. The "SUPER LX- RETRO" title is drawn as an `<img>` in the fixed bar.

## Window lock

"Lock Windows" is a checkbox, the last item of the player menu's Windows submenu. It is saved as `windowsLocked` in
`settings.json`, broadcast to every window over `window:locked` (read with `window:getLocked`), and read in the renderer
through `useLocked()`.
1. It can be turned on only when every visible window is attached in the player's group, or when it is already on.
   Turning it off is always allowed and changes no geometry.
2. At startup the saved lock is restored. If the restored layout is not one attached group, the lock is cleared and
   saved as false.
3. While locked, dragging any window moves every visible window in the group together. There is no tear-off, no snap and
   no change of docks, and the gaps stay at 2 px.
4. A single move report that jumps more than 200 px is ignored, unless the next report agrees or the position holds for
   50 ms. Openbox sends such bogus reports.
5. While locked, resizing any window resizes the whole group by one factor at resize end (`groupResize` in `dock.ts`).
   Every window's limits are respected. Fixed bars and gaps do not scale, matched heights stay matched, and the group's
   top-left corner stays put.
6. Display or work-area changes resize the group as a whole and keep it on screen (`fitGroup`). One window is never
   resized alone.
7. A window docked to a hidden window is re-anchored to the nearest visible ancestor for layout. A window reopened while
   locked returns to its dock spot.
8. The empty areas of the album and power windows become drag surfaces only while locked: the body gets the `.locked`
   class and `-webkit-app-region: drag`, and every button is `no-drag`. Rack and playlist content never drags.
   `app/test/dragRegions.test.ts` enforces this.

Limitation: on macOS no move events arrive during a drag, so the group follows at the drop. Group resize applies at
resize end, so windows can overlap briefly during a drag. Untested on Windows and macOS.

## OS rules (keep these when you change window code)

## OS rules (keep these when you change window code)

- **Own moves vs user drags:** the app records every position it sets or leaves, and ignores move and resize events
  at those positions for 1 s (`programmatic` / `isOwn`). A resize is ours only if the size matches too (`isOwn(w, true)`),
  because a user resize from the far corner keeps the position. Every programmatic move must go through these helpers
  (`setRect`, `resizeFixed`, `sync`), or the app will read its own move as a user drag.
- **Consequences are not drags:** a window's move or resize within 300 ms of a user change to another window is a
  consequence of it (a window manager keeps a side window on screen and moves it elsewhere than the app asked), never a
  drag of that window (`busyElsewhere`). Otherwise growing the player at a screen edge tears a side window off its dock.
- **Tear-off is confirmed 50 ms later**, because openbox briefly reports (0,0) while it reparents a window.
- **Windows:** use `setPosition` for a pure move, because `setBounds` can drift the size at fractional scaling.
  Windows keeps a window at least about 39 px tall, so a narrow window's shade bar can come out taller than asked;
  the shade docks the height the window really got.
- **macOS:** no move events arrive during a drag, so docked windows become the player's child windows
  (`setParentWindow`). A side window that macOS minimizes is restored with retries. Hide a side window through
  `hideSatellite`, which detaches it first: macOS drops a hidden child window from its parent while Electron still
  reports the parent, so it would never be attached again and activating the app would leave it behind.
- **Linux:** native Wayland gives apps no window positions, so the app runs on XWayland (`--ozone-platform=x11`: a one-time
  relaunch in `app/src/main/platform.ts`, passed directly by `pnpm dev`). On KWin under X11, re-show a side window
  with hide and `showInactive` instead of `restore()`. Set a side window's size inside `resizeFixed`, which lifts
  the resize lock of a shaded window and sets the minimum size.

## Checklist for a new window

- [ ] A failing test first (TDD rule), then the window.
- [ ] Every window rule and every side-window rule above holds.
- [ ] It is in `satellites`, `DEFAULT_DOCKS`, `SHADE`, `Settings`, and the `fromAppWindow` / `Sidecar` window lists.
- [ ] Its view is covered by `app/test/dragRegions.test.ts`.
- [ ] `scripts/e2e/dock.mjs` covers it: it docks on each side, follows a player drag, tears off and snaps back, has no
      taskbar entry of its own, comes forward when the player is activated, keeps its dock when it or the player is
      resized, and has the per-display size limits and ends a resize in proportion (or, if free, keeps its new width and
      height).
      Run the script locally and on CI (`.github/workflows/dock-e2e.yml`) on Linux, Windows and macOS.
- [ ] `docs/ARCHITECTURE.md` and this file are updated if anything changed.

## Known bugs

- **Power deck size on Linux (openbox, X11), found 2026-11-21.** When the power deck's size is set from code, openbox can leave it up to about 6 px off its body aspect: a requested height of 330 lands at 155x336, and after a width drag 220x468 (the whole-window ratio of the previous height) instead of about 225 wide. Re-locking the native aspect at the corrected height after a resize (`keepProportion`, `app/src/main/resizeEnd.ts`) did not change it. Windows and macOS are not affected. The dock E2E allows 8 px for the two power-deck checks on Linux only (`POWER_TOL` in `scripts/e2e/dock.mjs`) until this is traced with a local Xvfb + openbox repro.
