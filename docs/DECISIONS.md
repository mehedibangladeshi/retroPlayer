# Decisions

A log of decisions and the reasons for them. Append new entries at the end. Do not rewrite old entries; add a new entry that supersedes one instead.

## 2026-10-31 — Locked architectural decisions

Decision:
1. Audio engine in Rust. UI in Electron, TypeScript and React.
2. The engine runs as a separate sidecar process, not a Node addon. The UI is a thin client.
3. All audio work (decode, DSP, resample, output) happens in Rust. Samples never pass through JavaScript.
4. No Web Audio API and no `<audio>` or `<video>` elements for playback, including previews and tests.
5. The engine core is a pure library crate (`player-core`), reusable on iOS and Android. The sidecar is a thin IPC wrapper.
6. The UI looks identical on Windows, macOS and Linux. All visuals come from our own assets and CSS.
7. Multi-window is a future requirement. The player view is self-contained and holds no authoritative state.
8. Package manager pnpm. Node current LTS. Rust stable toolchain.

Why: These make audio quality (bit-perfect later), crash isolation, and portability possible. Changing any of them needs an explicit decision from the project owner.

## 2026-10-31 — Frameless window in Phase 1

Decision: The Phase 1 window is frameless, with no native title bar. The drawn minimize and close buttons on the cassette artwork send `window:minimize` and `window:close` over IPC. The player body is the drag region, and the buttons and cassette controls are marked no-drag.

Why: The user chose this look for the cassette design. It deviates from AGENTS.md, which says a standard OS frame is fine for now. The window stays fixed-size and non-resizable.

## 2026-10-31 — Cassette UI built from PNG layers

Decision: The cassette UI is composed from PNG layers in `assets/ui/png/` (2x), not from SVG layers. The reels are one PNG rendered twice and clipped per reel. The buttons are one sheet, sliced in code, with pressed and disabled states in CSS. Real SVG layers can replace them later.

Why: The provided SVG exports are duplicates. The three cassette SVGs are byte-identical, and the body base and top cover SVGs are identical, so they add no separate layers. The user chose PNG as the most efficient path. Missing or broken SVGs and missing button states are listed in `docs/ASSETS_TODO.md`.

## 2026-10-31 — Protocol types hand-written in Rust and TypeScript

Decision: The protocol types are written by hand, in Rust with serde in `engine/crates/engine-sidecar` and in TypeScript in `app/src/shared/protocol.ts`. Rust tests parse every JSON example in `docs/PROTOCOL.md` and round-trip it. There is no codegen dependency.

Why: `PROTOCOL.md` is the source of truth, and tests that parse its examples keep the two implementations in sync. This avoids a code generator for a small protocol.

## 2026-10-31 — Root pnpm workspace

Decision: The repo root is a pnpm workspace (`package.json` and `pnpm-workspace.yaml`, with the app as the package `app`). `pnpm dev`, `pnpm typecheck` and `pnpm lint` run from the root. `pnpm dev` runs `cargo build -p engine-sidecar` first, then starts electron-vite.

Why: One set of commands from the root covers the app and the engine build. The main process finds the sidecar at `engine/target/debug/engine-sidecar`, which `RETRO_SIDECAR` can override. Packaging is deferred.

## 2026-10-31 — Track title and time shown on the cassette label

Decision: The track title is shown on the light label strip at the top of the cassette. The elapsed and total time are shown near the "HIGH QUALITY AUDIO" text.

Why: The label is the natural place for track information on a cassette, and it keeps the player to one visible surface with no extra panels.

## Dependencies

Each dependency added to the project, with its reason. Later tasks append rows here when they add a dependency.

| Crate / package | Version | Used for | Why |
|---|---|---|---|
| `symphonia` (Rust) | 0.6.1 | Decoding FLAC, WAV, MP3, AAC/M4A (incl. ALAC), OGG Vorbis | One pure-Rust library covers all required formats. |
| `cpal` (Rust) | 0.18.2 | Audio output at the device's native rate | Cross-platform output on Windows, macOS and Linux, and no resampling when the rates match. |
| `rubato` (Rust) | 5.0.1 | Resampling when the file rate differs from the device rate | High-quality resampling, used only when needed. |
| `rtrb` (Rust) | 0.4.1 | Lock-free single-producer, single-consumer ring buffer between decoder and audio callback | The audio callback can read without locking or blocking. |
| `serde` (Rust) | 1.0.229 | Derive-based types for the protocol | Standard serialization for Rust. |
| `serde_json` (Rust) | 1.0.154 | Encoding and decoding NDJSON protocol lines | Standard JSON for Rust, used with serde. |
| `electron` (JS) | 45.2.1 | Desktop shell: window, native file dialog, process spawning in main | Cross-platform desktop app with the same UI on all three OSes. |
| `electron-vite` (JS) | 6.0.0 | Dev server and build for main, preload and renderer | Standard build setup for Electron with Vite. |
| `vite` (JS) | 8.3.5 | Bundler and dev server used by electron-vite | Used by electron-vite; fast dev reloads. |
| `@vitejs/plugin-react` (JS) | 6.1.2 | React support (JSX transform and fast refresh) in the renderer build | Standard Vite plugin for React. |
| `react` (JS) | 19.3.1 | Renderer UI | Component model for the cassette UI and the debug view. |
| `react-dom` (JS) | 19.3.1 | Renders React into the renderer window | Required by React for the browser. |
| `typescript` (JS) | ~6.0.3 (held below 6.1: typescript-eslint requires it) | Strict typing for the renderer, preload, main and shared protocol types | Catches protocol mismatches at compile time. |
| `eslint` (JS) | 10.14.0 | Linting | Enforces code quality for `pnpm lint`. |
| `typescript-eslint` (JS) | 8.72.1 | TypeScript rules for ESLint | Lints TypeScript sources with type-aware rules. |
| `@eslint/js` (JS) | 10.0.1 | Base ESLint rule set for the flat config | Standard ESLint recommended rules. |
| `eslint-plugin-react-hooks` (JS) | 7.1.1 | Lint rules for React hooks | Catches hook misuse in the renderer. |
| `globals` (JS) | 17.13.0 | Global variable names for the browser and Node environments in the ESLint config | Lets lint know which globals exist in each part of the app. |

## 2026-10-31 — Open a file by clicking the cassette

Decision: The cassette artwork has no Open button. A file is opened by clicking the cassette, or with Ctrl/Cmd+O. Dropping a file on the window also works.

Why: The user chose this. The artwork stays free of extra controls.

## 2026-10-31 — Audio device opened lazily on first load

Decision: The engine starts without opening an audio device. The device is opened on the first `load`. If none is available, `load` fails with `no_output_device` and nothing else changes.

Why: The engine starts on machines without audio, and the missing device is reported as a readable error at the point it matters.

## 2026-10-31 — Acknowledged ring clear for seek, stop and load

Decision: `seek`, `stop` and `load` clear the ring buffer with an acknowledgement. The player requests the clear, waits until the audio callback confirms it drained the ring, then resets the frame counter and refills.

Why: A plain clear flag raced with refilling. Samples written after the flag was set could be dropped, and the position drifted from what was heard.

## 2026-10-31 — Ring size of 96,000 frames

Decision: The output ring holds 96,000 device frames. That is about 0.5 s at 192 kHz and about 2 s at 48 kHz.

Why: Seek latency is not affected by the size, because the acknowledged clear empties the ring on seek.

## 2026-10-31 — Seek is packet-accurate, not sample-accurate

Decision: A seek lands on the packet boundary at or before the target. The `state` event after a seek reports the actual position, and the player uses that position.

Why: symphonia seeks to the packet containing the target, so exact sample positions are not available. Reporting the real position keeps the UI honest.

## 2026-10-31 — Device-dependent player tests are ignored

Decision: Player tests that need an audio device are marked `#[ignore]`. They run with `cargo test -p player-core -- --ignored`.

Why: This keeps `cargo test` silent and safe to run in CI, where there is no audio device.

## 2026-10-31 — Preload as CommonJS and a dev-only CSP relaxation

Decision: The preload is built as CommonJS (`.cjs`), because sandboxed renderers cannot load ESM preloads. The renderer CSP is relaxed only under `electron-vite dev`, which needs an inline preamble and an HMR websocket. The production build keeps the strict CSP.

Why: The sandbox requires a CommonJS preload, and the dev server needs its own inline script and websocket. Production should not carry either.

## 2026-10-31 — Engine accepts and rounds fractional seek values

Decision: `seek` and `seekRelative` accept any JSON number. The engine rounds to the nearest integer, halves away from zero, and treats a negative `positionMs` as 0. The Electron main process also rounds before sending.

Why: A fractional value from the UI should not be rejected as `bad_message`. Rounding in main keeps what it sends to the engine as integers.

## 2026-10-31 — Label text uses a system font stack; ink colours sampled from the artwork

Decision: The title and time on the label use a system font stack for now, because no font file is bundled (see `docs/ASSETS_TODO.md`). The ink colours were sampled from the artwork: title `#7f2a3c`, time `#6b6c72`.

Why: No font was provided, and matching the artwork's ink colours keeps the label looking like the design.

## 2026-10-31 — Disabled buttons use opacity 0.7 and no grayscale

Decision: Disabled buttons are shown with opacity 0.7 and no grayscale filter.

Why: A stronger dimming (opacity 0.45 with grayscale) made the whole player look darker than the artwork, because the disabled style was applied to all buttons in the empty state.

## 2026-10-31 — Test bundles with electron-builder, built per OS in CI

Decision: Packaging uses `electron-builder` (dev dependency of `app/`). Targets: AppImage and tar.gz on Linux, an NSIS installer and a zip on Windows, dmg and zip on macOS (arm64 and x64). The release-mode sidecar is copied next to `app.asar` through `extraResources`, and `main/sidecar.ts` resolves it from `process.resourcesPath` when packaged. The GitHub Actions workflow `.github/workflows/package.yml` builds each OS on its own runner. Linux builds on Ubuntu 22.04 to keep the glibc requirement low. The Squirrel installer helper's build script is denied in `pnpm-workspace.yaml` because we don't build Squirrel installers.

Why: The Rust sidecar has to be compiled for each OS and architecture, and cross-compiling from one machine is not reliable (macOS needs Apple's SDK). Running electron-builder per runner keeps one config for all three platforms.

Builds are unsigned. Windows shows a SmartScreen warning. On macOS the app is ad-hoc signed (`identity: '-'`, hardened runtime off), which Apple Silicon needs before it will launch it, but Gatekeeper still blocks the first open. Real signing and notarisation are deferred until there is a certificate.

## 2026-10-31 — Dev runs use a separate userData profile

Decision: When not packaged, main sets `userData` to `<default>-dev` before taking the single-instance lock. The app's `productName` is `RetroPlayer`.

Why: Without this, an installed build and a running `pnpm dev` session shared one profile and one single-instance lock, so the second one to start quit silently.

## 2026-10-31 — Node 26 LTS

Decision: The project targets Node 26 (LTS "Lithium" since 2026-10-28). `.nvmrc` holds `26`, the root `package.json` has `engines.node >=26`, and CI reads its Node version from `.nvmrc`. The GitHub Actions used in CI were moved to their current majors, which run on the Node 24 actions runtime.

Why: AGENTS.md asks for the current Node LTS, and Node 26 became LTS this week. The old action versions ran on the deprecated Node 20 runtime and printed warnings on every run.

## 2026-11-01 — App name "Cassette Player: Retro"

Decision: The display name is "Cassette Player: Retro". The window title and the UI use it, with the colon. The `productName` is `Cassette Player Retro`. Release files are named `Cassette-Player-Retro-<version>-<os>-<arch>`, and the Linux executable is `cassette-player-retro`. The appId `dev.mehedibangladeshi.retroplayer` and the repository name are unchanged. The user-data folder is now `Cassette Player Retro`.

Why: The name is the user's choice. A colon is not allowed in Windows file and folder names, and macOS Finder shows it as "/". Nothing was saved in the old user-data folder yet, so no migration is needed. This supersedes the `productName` `RetroPlayer` from the entry above.

## 2026-11-01 — Resizable, aspect-locked window that scales the player as one picture

Decision: The window can be resized, and it keeps the composition's 767:616 aspect ratio (`setAspectRatio`). The renderer scales the fixed 767x616 composition with `transform: scale(min(w/767, h/616))`, centred. Spare space is letterboxed in the dark body colour. The minimum content size is 575x462 (75%). On first launch the window is 55% of the primary work-area width, capped at 80% of its height, and centred. Saved size, position and full-screen state are restored only if the saved rectangle is on a connected display.

Why: The user asked for a responsive default size, a remembered size and a minimum size. Scaling the whole picture keeps the artwork looking the same on every OS. Above 2x scale the 2x PNGs soften. We accept that.

## 2026-11-01 — Full screen with F11, Esc and the drag region

Decision: F11 (Ctrl+Cmd+F on macOS) toggles full screen, and Esc leaves it. Double-clicking the drag region toggles it too, so the OS "maximize" action becomes full screen. A full-screen box sits next to minimize and close.

Why: The window is frameless, so it has no OS title bar with its own maximize control and shortcuts. The app supplies them.

## 2026-11-01 — Settings in a main-process settings.json

Decision: The main process keeps a `settings.json` file in the user-data folder (`app/src/main/settings.ts`). It holds the window state and `lastOpenDir`. Writes go to a temporary file that is then renamed over the old one. If the file is missing or invalid, the defaults are used. The Open dialog starts in `lastOpenDir` if that folder still exists. No dependency is added.

Why: This is the smallest way to save a few values. Storing them in the renderer would put file paths in the UI process, and the renderer should not read or write files.

## 2026-11-01 — Solid keys with elevation and latching

Decision: Keys are always opaque. The disabled state is brightness 0.8, with no opacity change. Raised keys get a shape-following `filter: drop-shadow`. A pressed key moves down 3 px, and its shadow gets smaller (80 ms). Play stays latched down while playing, and Pause stays latched down while paused. Clicking a latched Pause resumes playback, as on a tape deck. This supersedes the 2026-10-31 entry "Disabled buttons use opacity 0.7 and no grayscale".

Why: The user asked for solid keys that look physically pressed. Opacity made the keys look see-through.

## 2026-11-01 — Artwork edits: moved pill and a drawn full-screen box

Decision: The right pill in `body-bottom` moved 15.5 CSS px outward, so both pills sit 24 px from their side edge. The source (`source/player-body-bottom-part-with-boltu.png`) was edited and the PNG regenerated. The full-screen box `png/chrome-fullscreen.png` was drawn for this project from the minimize box, with four corner brackets as the glyph.

Why: The user asked for both. This is an exception to the rule not to invent artwork, made at the user's request. See `docs/ASSETS_TODO.md` items 12 and 13.

## 2026-11-01 — Pills sit on the body seam

Decision: Both pills in `body-bottom` moved about 20 CSS px down (60 px in the source) so each is centred on the thin seam between the upper body and the lower panel (CSS y 500-511). The seam itself is unchanged and not transparent.

Why: The user wants the pills to read as clips holding the two body parts together. A truly see-through seam was considered and declined: it needs a transparent window, which Electron warns may break resizing on some platforms.

## 2026-11-01 — The body seam is a shaded groove

Decision: The seam between the upper body and the lower panel is redrawn in `body-bottom` as a thinner groove: the upper panel's edge rolls off and casts a shadow into a dark line, and the lower panel's lip has a faint highlight, as if lit from above. The artist's rounded panel corners at both ends are kept, and the groove fades into them. Exact rows and colours are in `assets/ui/MANIFEST.md`.

Why: The user asked for a thinner seam that looks grooved, with the panels sitting on top of it.

## 2026-11-01 — Key sounds are played by the engine

Decision: The transport keys play sounds: Play and Pause play `button_click.mp3`, Stop plays `stop_button.mp3`, and Rewind and Forward play `rewind_forward.mp3` once per press (not again while held). The keyboard shortcuts play the same sounds as the keys. A disabled key, or a shortcut that does nothing, is silent. The engine decodes the sounds and mixes them into its output on top of the music, through two new commands, `loadSound` (main process only) and `playSound`. A failed sound is logged to stderr and never shown to the user. Adding these commands doesn't change the protocol version. The sound files live in `assets/audio/` and are bundled into `resources/sounds/`. The name-to-file map is `app/src/shared/sounds.ts`, so other keys can get sounds later.

Why: AGENTS.md locks all audio to Rust and forbids Web Audio and `<audio>`, so the renderer can't play the sounds itself. The user chose the engine path over an exception to that rule. Mixing in the existing callback needs no new dependency (`symphonia` already decodes MP3) and no second audio stream.

## 2026-11-01 — JS unit tests use node:test

Decision: JS unit tests use Node's built-in `node:test` runner with `node:assert/strict`, run by `pnpm test` over `app/test/`. Node 26 runs the `.ts` files directly (native type stripping), and `app/test/alias-hooks.mjs` maps the `@shared/*` path alias for it. No new dependency was added. The first suite covers the main-process NDJSON parsing and renderer command validation (`app/src/main/ndjson.ts`).

Why: The main process has security-relevant logic (which commands the renderer may send) that was untested. Node is already pinned to 26 by `.nvmrc`, so a runner such as Vitest or Jest would add a dependency for no gain.

## 2026-11-01 — Smaller release bundles

Decision: Three changes make the release bundles smaller. (1) `react` and `react-dom` moved from `dependencies` to `devDependencies` in `app/package.json`. Vite already bundles React into `out/renderer`, and the main and preload bundles do not load React, so electron-builder no longer copies `node_modules/react*` into `app.asar` (about 8.3 MB). (2) The sidecar release profile in `engine/Cargo.toml` uses `lto = "fat"`, `codegen-units = 1` and `strip = "symbols"`. `opt-level` stays at 3 for real-time headroom, and `panic` stays at `unwind` because the sidecar recovers from panics with `catch_unwind`. (3) `app/electron-builder.yml` sets `compression: maximum`.

Why: About 94% of each ~120 MB bundle is the Electron runtime, which cannot be cut safely. These changes remove our own waste. Rejected: pruning Chromium locales (the user declined), deleting swiftshader (the window goes blank without a GPU) or the Chromium licence files (licence compliance), and `panic = "abort"` (it would break the sidecar's `catch_unwind` recovery).

## 2026-11-01 — Windows installer without the differential-update payload

Decision: `nsis.differentialPackage: false` in `app/electron-builder.yml`.

Why: electron-builder makes NSIS installers differential-aware by default, for electron-updater's block-level downloads. That forces a 1 MB dictionary, non-solid 7z and normal compression, so `compression: maximum` had no effect: the 0.1.3 installer was 116 MB against 117 MB for 0.1.2. The app has no auto-updater, so the differential payload gains nothing. Measured on the Linux build tree with 7-Zip, solid maximum compression is about 10% smaller (81 MB against 90 MB). Revisit this if electron-updater is added.

## 2026-11-01 — Album import and a second playlist window

Decision: At the owner's request, the app can import a whole album folder and show it in a second window, the playlist window. This overrides locked decision 7 in AGENTS.md ("do not implement multiple windows now") and the ROADMAP out-of-scope items for playlist, multiple windows and cover-art extraction. The windows still hold no authoritative state. Both windows render the same engine events, and main forwards every event to each live window.

Why: The user wants an album to play as a playlist beside the player, with its cover. Decision 7 existed so a second window could later show the same state without changes to the engine. This keeps that design.

## 2026-11-01 — The playlist lives in the Rust engine

Decision: The queue is a `Playlist` in `player-core`, and the folder is read by `scan_album`. Electron does not hold the queue. When a track ends, the sidecar advances to the next track and plays it. The advance is guarded, so an `Ended` that was already queued when the user picked a track cannot skip that track. After the last track the engine stops.

Why: Auto-advance keeps working when a renderer freezes, just as playback does. The core stays reusable on mobile, and no playlist logic is duplicated in JavaScript.

## 2026-11-01 — Tags and cover art are read by the engine

Decision: `symphonia` reads the tags (title, artist, album, year, track and disc numbers) and the embedded pictures. The `id3v1` and `id3v2` features are enabled for MP3 tags. The cover is the embedded front cover of any track, or else the first embedded picture. If there is none, the cover is a `cover`, `folder`, `front` or `album` .jpg or .png in the folder. If there is none of those either, the renderer draws `default-cover.svg`. Covers over 8 MiB are skipped. The cover is sent once, as a data URL, in the `playlist` event. The current track is not a separate event. The renderer matches `state.trackInfo.path` against the playlist's track paths.

Why: The engine already decodes the files, so reading tags needs no new crate. Sending the cover once keeps the `state` and `position` events small.

## 2026-11-01 — Import entry points

Decision: The Open button opens a small popover with "Open file…" and "Open album…". The popover is drawn in CSS, because one native dialog cannot pick both files and folders on Windows and Linux. Dropping a folder on the player imports it as an album. Ctrl/Cmd+Shift+O opens the folder dialog, and Ctrl/Cmd+L shows the playlist window again. An album import plays track 1 automatically, as a single file does. Opening a single file clears the album and hides the playlist window.

Why: A CSS popover looks the same on every OS, as AGENTS.md decision 6 requires. The OS dialogs cannot do both picks in one dialog.

## 2026-11-01 — The playlist window has its own frame

Decision: The playlist window is frameless and draws its own minimise and close controls from `assets/ui/playlist`. Its aspect ratio is locked to the artwork (1874:1885). Close hides the window, and a new album import or Ctrl/Cmd+L shows it again. Its bounds are saved in `settings.json` as `playlistWindow`, in the same shape as the player's window state. The window resizes from its edges. The resize grip in the artwork is decorative, and a draggable grip is a later follow-up.

Why: The artwork has its own chrome, so an OS frame would clash with it and look different on each OS. Hiding instead of closing keeps the playlist where the user left it.

## 2026-11-01 — The playlist uses a bundled handwriting font

Decision: The playlist text uses "Sue Ellen Francisco", a font under the SIL Open Font License. It is bundled as a WOFF2 file with its licence. It is an approximation of the designer's lettering, and it can be swapped through `FONT_FAMILY` in `app/src/shared/layout.ts`.

Why: A bundled font looks the same on every OS. A system font would not.

## 2026-11-01 — No new dependencies for album import

Decision: No crate or npm package is added. The album feature only turns on two `symphonia` feature flags, `id3v1` and `id3v2`.

Why: The existing decoder and the standard library cover tags, covers and folder scans.

## 2026-11-01 — Album-art window

Decision: A third window shows the cover of the current track, for albums and single songs. It is frameless. Its frame is a CSS placeholder for now, with the minimise and close buttons cropped from the top layer of the playlist artwork. The engine sends a new `artwork` event after each successful track load. The cover is the track's embedded art, else a folder image, else the album cover, else `null`. The event is sent only when the cover changes, so an album with one shared cover is sent once. The window shows when the cover is not `null` and hides when it is `null`. Close hides the window. Its bounds are saved in `settings.json` as `albumWindow`.

Why: The user wants the cover visible beside the player, including for single songs that have art. Sending only on change keeps the events small and the window steady across tracks that share a cover. The frame is a placeholder because the final artwork is not drawn yet (see `docs/ASSETS_TODO.md`).

## 2026-11-01 — Window placement on first appearance only

Decision: On first appearance (no saved bounds), the playlist window sits flush against the player's right edge and the album-art window flush against its left edge, both at the player's top. The album-art window is square, sized to the player's content height. Both are clamped to the screen. After that the saved bounds win. The windows do not dock to each other and do not follow the player when it moves.

Why: Flush placement shows the windows as one unit the first time, without fixing their positions for good. Once the user moves a window, that position is kept.

## 2026-11-01 — Playlist selection, durations and track keys

Decision: In the playlist, a single click selects a track, and a double-click or Enter plays it. Each row shows its duration, right-aligned as m:ss, or blank when unknown. N and P play the next and previous album track from the player and the playlist windows. The renderer works out the target from the album and the current track path, and sends it as `playIndex`, so no new engine command is needed. N and P do nothing at either end of the album, or when no album is loaded.

Why: Selecting before playing is how track lists normally work, and the duration helps the user choose. Computing the target in the renderer reuses `playIndex`, so the engine gets no new command.

## 2026-11-01 — Docking supersedes "first placement only"

Decision: This supersedes the "Window placement on first appearance only" entry above, which said the windows neither dock nor follow the player. The cover window attaches to the player's left and the playlist window to its right, flush. Attached windows follow the player's moves and resizes. Dragging a window more than 12 px away detaches it, and dropping it within 12 px of the player's edge re-attaches it. A side window never overlaps the player. When it opens at a saved spot that would overlap, it is re-attached. If there is no room on a side, the player is nudged inward. If the screen is too narrow for all three windows, the side windows may go partly off-screen, but never over the player. The geometry lives in the pure, unit-tested `app/src/main/dock.ts`.

Why: The user wants the windows to read as one unit beside the player, and a window that drifts over the player hides it. A 12 px snap tolerance lets a window be attached by a near miss. Keeping the geometry in a pure module lets it be tested without Electron.

## 2026-11-01 — Window positions are decided by the compositor on Wayland

Decision: Wayland does not let apps place windows, so docking and placement only work on Windows, macOS and X11. On Wayland the compositor decides where each window appears. The owner chose to keep native Wayland rather than force XWayland.

Why: Forcing XWayland would fix placement but make the app look different on Linux, against the cross-OS rule in `AGENTS.md`. The limit is accepted and documented, not worked around.

## 2026-11-01 — Only the player goes full screen

Decision: Only the player goes full screen, with F11, Ctrl+Cmd+F on macOS, or its button. Escape exits. Double-clicking never maximises or full-screens any window. Maximize is undone as soon as it happens, because Linux ignores `maximizable: false`. The side windows are not full-screenable. This supersedes the "Full screen with F11, Esc and the drag region" entry above, which made a double-click on the drag region toggle full screen.

Why: A player that jumps to full screen on a stray double-click is a surprise, and the side windows have no sensible full-screen layout beside the player.

## 2026-11-01 — Transparent windows with clipped rounded corners

Decision: All windows are transparent (`backgroundColor` `#00000000`). Each view clips itself to the corner radius of its artwork, so the artwork's corners show through the window.

Why: The artwork has rounded corners, and an opaque window would show square corners behind them.

## 2026-11-01 — Playlist resize grip uses a sender-checked IPC

Decision: The playlist's corner grip resizes its window through a `window:resize` IPC. Main accepts it only from a side window, never from the player, and checks that both values are finite. Main clamps the size to the window's aspect ratio and minimum size, keeps the top-left corner fixed, and re-snaps the window if it is attached.

Why: The renderer cannot resize its own window, so the request must go through main. Checking the sender and clamping in main means a renderer cannot resize a window to an arbitrary size.

## 2026-11-01 — The engine tags Ended with a load generation

Decision: The engine tags each `Ended` event with a load generation. The generation increases inside the audio worker's load handling, under the same lock as the track switch. The sidecar advances the playlist only when the `Ended` generation is current, so a stale `Ended` cannot skip a track the user just picked. The wire protocol is unchanged, so `docs/PROTOCOL.md` does not change.

Why: Without the tag, an `Ended` from the old track could arrive just after a manual pick and skip the new one. Doing the increment under the track-switch lock makes the check race-free. Keeping the wire format unchanged avoids a protocol version bump for an internal fix.

## 2026-11-01 — Test-first is mandatory, enforced by a pre-commit hook

Decision: `AGENTS.md` "How to work" items 8 and 9 make test-driven development mandatory. Every behaviour change or bug fix starts with a failing test. A versioned pre-commit hook, `scripts/git-hooks/pre-commit`, runs typecheck, lint, the JS tests, the cargo tests and clippy, and blocks a failing commit. `pnpm install` enables the hook through the `prepare` script, which sets `core.hooksPath`. CI on push and a Claude Code hook were considered and not chosen.

Why: A hook that runs on every commit catches a failing test before it is shared, and it works the same for any contributor and any agent. CI on push would catch the same failures later, and a Claude Code hook would only cover Claude's commits.

## 2026-11-06 — Forward and backward split into click and hold

Decision: On the player's forward and backward buttons, a press under 400 ms is a click and a press of 400 ms or more is a hold. A click on forward goes to the next track, and does nothing on the last track or with a single file. A click on backward restarts the song if more than 3 s in, otherwise goes to the previous track; on the first track or a single file it restarts. A hold seeks -/+10 s, repeating every 200 ms, with the reels spinning faster. Keyboard Left/Right keeps tap-to-seek and hold-to-repeat, and n/p change track. This replaces the "clicking = +/-10 seconds" rule in `AGENTS.md`.

Why: A click that only seeked 10 s gave no quick way to change track from the buttons. The 400 ms threshold separates a click from a hold, so one button can do both. The keyboard keeps seek on Left/Right and gets track changes on n/p.

## 2026-11-06 — Playlist and album-art windows open at launch

Decision: All three windows open at launch: the player, the playlist (docked right) and the album-art window (docked left). The playlist and album-art windows start empty and stay open when there is no album or cover. A satellite the user closes stays hidden until the next launch; Ctrl+L reopens the playlist. Satellites have no taskbar entry of their own (`skipTaskbar`). Minimizing the player hides them, and restoring the player re-shows the ones that were visible. This replaces the lazy creation and the "only with an album or cover" rule.

Why: The three windows read as one set from the first launch, and an empty window shows where content will appear. Hiding satellites with the player keeps the set together when the player is minimized.

## 2026-11-06 — Satellite minimize rolls up into a window shade

Decision: On the playlist and album-art windows, the minimize button rolls the window up into its own top bar, and it stays docked. The playlist shades to 80 design px and the album-art window to 70. The minimize button again, or a double-click on the top bar, restores it. While shaded, the minimize icon shows a "restore" glyph. Only the player's minimize sends everything to the OS taskbar or dock. Shading uses two UI-internal Electron IPC channels, `window:toggleShade` (renderer to main) and `window:shaded` (main to renderer). They are not part of the engine protocol.

Why: A Winamp-style set needs its windows to stay docked. An OS minimize would give each satellite its own taskbar entry and take it out of the set. A shade keeps the window in place. Risk: a double-click on a drag region is caught through the window's `maximize` event, since Linux ignores `maximizable: false`. This is untested on macOS.

## 2026-11-06 — Side-window drag region is one top-bar strip

Decision: The playlist and album-art windows have exactly one drag region: a childless strip in their top bar (`.pl-titlebar`, `.al-titlebar`), left of the minimize and close buttons. Nothing else in those views sets `-webkit-app-region`. `app/test/dragRegions.test.ts` fails if that changes.

Why: Chromium builds drag regions in DOM order. The top artwork `<img>` came after the rows and buttons and inherited `drag`, so it covered the whole window and every click became a title-bar click. A live CDP probe with real clicks found this. Scaling was not the cause, so the transform in the 2026-11-01 "Resizable, aspect-locked window" entry stays.

## 2026-11-06 — No window is full screen or maximized

Decision: No window goes full screen or maximizes, the player included. The F11, Ctrl+Cmd+F and Esc handling, the full-screen button, its IPC and the saved full-screen setting are removed. All windows are `maximizable: false` and `fullscreenable: false`. A `maximize` listener calls `unmaximize()` at once, because Linux ignores `maximizable: false`. The drawn full-screen box (`chrome-fullscreen.png`) is removed from the assets. Supersedes the 2026-11-01 "Only the player goes full screen" entry. Also supersedes the full-screen parts of the 2026-11-01 "Resizable, aspect-locked window" entry (full-screen state restore) and of the "Artwork edits" entry (the drawn full-screen box).

Why: Owner decision. Full screen and maximize would break the fixed, docked set of three windows.

## 2026-11-06 — Double-click does nothing; roll-up only from minimize

Decision: A double-click does nothing on any window, the player and the top bars included. A side window rolls up and down only with its minimize button. Supersedes the double-click restore in the 2026-11-06 "Satellite minimize rolls up into a window shade" entry, and its `maximize`-event catch. On macOS, if the system setting makes a title-bar double-click minimize, a side window rolls up instead. Untested on macOS.

Why: Owner decision. The double-click restore relied on the `maximize` event, which is a fragile signal to build a control on.

## 2026-11-06 — Side windows match the player's height

Decision: The playlist and album-art windows are always the same height as the player, docked or not. Their width comes from their design aspect ratio. They are not resizable by the user. The playlist's resize grip and its `window:resize` IPC are removed. Supersedes the 2026-11-01 "The playlist window has its own frame" entry's resize-from-edges and grip statements, and the "Playlist resize grip uses a sender-checked IPC" entry. Also supersedes the square sizing in the 2026-11-01 "Window placement on first appearance only" entry, since the album-art window is no longer square.

Why: Owner decision. One shared height keeps the three windows aligned as a set, and a fixed aspect ratio keeps the artwork true to its design.

## 2026-11-06 — Cover-art window drawn from artist layers

Decision: The album-art window is drawn from the artist's layers in `assets/ui/source/album cover deck/`: a base, three display-only tabs ("Cassette Box", "J-Flap", "Lyric"), and a top layer with the glass, border and buttons. The playing cover sits under the glass. The reference art and the preview are not shipped. Supersedes the frame in the 2026-11-01 "Album-art window" entry, which was a CSS placeholder cropped from the playlist artwork.

Why: The artist's layers replace the placeholder. The tabs are display-only for now.

## 2026-11-06 — Linux runs on any platform; no side-window docking on native Wayland

Decision: Linux runs on whatever platform is available. On native Wayland the app cannot position windows, so side windows do not dock there. This is accepted. Windows and macOS are the targets for the full behaviour. Extends the 2026-11-01 "Window positions are decided by the compositor on Wayland" entry, and does not change it.

Why: Owner decision. This accepts the limit that entry describes, rather than forcing XWayland.

## 2026-11-06 — UI sounds can loop until stopped

Decision: `playSound` takes an optional `loop` flag, and `stopSound {name}` ends a sound. A looping sound restarts at 0 when it ends. A second loop of a sound that is already looping is ignored. `stopSound` ends every voice of that sound, looping or not. Looping voices count toward the 4-voice mix cap. Inside the engine, `Output::loop_clip` and `Output::stop_clip` send a small `Cmd` enum (`Play`, `Loop`, `Stop`) through the existing sound ring to the audio callback. The callback does no allocation, locking or logging. The wire format is in `docs/PROTOCOL.md`. Extends the 2026-11-01 "Key sounds are played by the engine" entry.

Why: The seek hold needs a sound that runs for as long as the button is held and stops on release. A one-shot sound would need a timer in the UI, and the UI must not keep its own clock for audio.

## 2026-11-06 — Tape-motor loop is FLAC, cut to loop seamlessly

Decision: Holding forward or rewind loops `assets/audio/tape_motor.flac`, mapped as `motor` in `app/src/shared/sounds.ts`. The file is an 8.0 s loop cut from the artist's 60 s mp3 (source 20-28 s), with a 0.4 s equal-power crossfade at the seam. The renderer starts the loop when a hold starts (after the 400 ms delay, or when a key is held) and plays the one-shot `seek` sound with it. It stops the loop when the hold ends. A click plays no motor sound. The main process also sends `stopSound motor` when the player window's renderer closes, crashes or reloads, so a dead UI cannot leave the loop running. `electron-builder.yml` copies `*.flac` into the resources too.

Why: An mp3 adds encoder padding, which leaves a gap at the loop point. FLAC keeps the loop clean. The engine decodes each sound fully and caps sound length at 10 s, so an 8 s loop fits.

## 2026-11-06 — Default player window is 25% of the work area (provisional)

Decision: On first launch the player is 25% of the primary work-area width, down from 55%. Its height is capped at 80% of the work-area height, and its minimum width is 384 (minimum height 308). The value comes from `defaultPlayerSize` in `app/src/main/windowSize.ts`. The 25% figure is provisional. The owner will pick the final size after testing. Supersedes the 55% first-launch size in the 2026-11-01 "Resizable, aspect-locked window that scales the player as one picture" entry. The rest of that entry still holds.

Why: The 55% window was too big on the owner's screen. 25% is a value to test, not a settled design. The minimum was lowered from 575 to 384 so the player can get that small.

## 2026-11-06 — One-time layout reset through `layoutVersion`

Decision: `settings.json` stores a `layoutVersion`. The current value is `LAYOUT_VERSION = 3` in `app/src/main/windowSize.ts`. When settings load with a missing or older version, the saved player, playlist and album-art window bounds are dropped once. `lastOpenDir` is kept. Every save writes the current version. To reset window sizes again, bump `LAYOUT_VERSION`.

Why: Without a version, old saved bounds would keep the old sizes forever. One version number resets them once and leaves the user's Open folder alone.

## 2026-11-07 — Playlist font is "Another Typewriter"

Decision: The playlist's album heading and song rows use "Another Typewriter", a public domain font, bundled as `assets/ui/playlist/fonts/AnotherTypewriter.ttf` with its licence in `AnotherTypewriter-EULA.txt`. It replaces "Sue Ellen Francisco" from the 2026-11-01 entry, which is superseded. The font file and its OFL licence are removed. The font applies only to the playlist window, through `PLAYLIST.FONT_FAMILY` in `app/src/shared/layout.ts`. Sizes are 32 px for the heading and 28 px for rows, with a 36 px row pitch, all in design px. The font stack is `'Another Typewriter', monospace`. The font has no '-', '…' or accented letters, so artist and title are joined with an en dash, and missing glyphs fall back to the system monospace font.

Why: The user picked the font and the sizes from a rendered preview of four options. The OS text size was rejected: Electron cannot read it reliably (macOS has no such setting), the Rust core must stay free of UI concepts, and a per-OS text size would break the rule that the UI looks identical on every OS. Accepted by the user: the fallback glyphs may differ slightly per OS.

## 2026-11-07 — Side-window art is cropped to its body

Decision: The album and playlist layer PNGs are cropped to their 1874x1874 base body (album lost 3 transparent rows at the bottom, playlist 11 at the top), so both design sizes are 937x937 and every playlist y position moved up 5.5 design px (shade bar 80 to 74.5). `app/test/sideArt.test.ts` checks the sizes against the PNG headers. The playlist aspect is now 1:1, superseding the 1874:1885 in the playlist frame entry.

Why: Side windows take the player's exact pixel height and the player art fills its canvas edge to edge, so transparent rows made the side windows' visible body slightly shorter than the player.

## 2026-11-07 — Docking on every side, between any windows; Linux runs on XWayland

Decision: Any window docks to any side of any other, and everything docked to the player, directly or through other windows, moves with it. The docks are a tree read from the window geometry (`inferDocks`) after every drop and at startup, rather than a stored setting. On Linux, a Wayland session with an X server relaunches the app once with `--ozone-platform=x11` so it can place windows. A Linux machine with Wayland and no XWayland still runs, without docking. This supersedes the 2026-11-01 "Window positions are decided by the compositor on Wayland" and 2026-11-06 "no side-window docking on native Wayland" entries. macOS makes docked windows child windows of the player, because it sends no move events during a drag. No dependency was added. The playlist window's minimum height drops from 322 to 308, the player's minimum, so a side window can always take the player's height (322 came from the old 1874:1885 playlist aspect).

Why: The owner asked for docking from any side, between any windows, with the group following the player on every OS, plus whatever OS-specific fixes that needs. Native Wayland does not let an app read or set its window positions, so XWayland is the only way to dock on Linux. `app.commandLine.appendSwitch` runs too late to change Chromium's platform (checked: the window stayed a Wayland window), so a one-time relaunch is used, and `pnpm dev` passes the flag through electron-vite instead. Reading docks from geometry keeps the saved settings format unchanged and makes a docked layout survive a restart for free.

## 2026-11-07 — One taskbar/Dock icon; side windows are children of the player

Decision: The app shows one taskbar/Dock icon, and activating it brings every visible window forward. On Windows and Linux every side window is created with the player as its parent (an owned window on Windows, a transient `WM_TRANSIENT_FOR` window on X11). On macOS only docked windows are children, as before, and `app.on('activate')` restores and focuses the player. `scripts/e2e/dock.mjs` checks it with another app's window covering all three (`scripts/e2e/cover.cjs`) and a taskbar-style activation (`_NET_ACTIVE_WINDOW` from `scripts/e2e/activate-linux.py` on X11, `SwitchToThisWindow` from `scripts/e2e/activate-win.ps1` on Windows, app activation on macOS), and reads the stacking order from the OS (`scripts/e2e/zorder.mjs`). On Windows and macOS it also clicks the app's real taskbar button or Dock icon with OS mouse input (`scripts/e2e/click-taskbar-win.ps1`, `scripts/e2e/click-dock-mac.swift`), and counts the taskbar entries on all three OSes.

Why: The owner asked for all windows under one icon, raised together, on every OS. `skipTaskbar` alone was not enough: on KDE (XWayland) KWin ignored `_NET_WM_STATE_SKIP_TASKBAR` from Electron and from a raw client message, so each window had its own icon, and raising one window left the others behind. A transient window is folded into its main window by Linux taskbars and raised with it, and an owned window on Windows has no taskbar button and rises with its owner, so one mechanism covers both. Openbox minimizes a transient's whole group, so on openbox an OS minimize of a side window minimizes the app, and restoring the player brings every window back (the side window's minimize handler steps aside when the player is minimized too); on KWin it still shades. macOS child windows move with their parent, so a detached window there cannot be a child; macOS already gives one Dock icon per app and a Dock click brings the app's windows forward. Raising the side windows with `moveTop` from the player's `focus` event was tried first and dropped: the parent relationship lets the OS do the raise, with no extra code path that moves windows.

## 2026-11-07 — Resizing keeps windows docked: consequences are not drags, and the group is fitted after a resize

Decision: A side window's move or resize within 300 ms of a user change to another window is treated as a consequence of that change, never as a drag of the side window. A player resize now settles like a drop, and after a user resize the player's docked group is nudged onto the screen (`fitGroup`, as when a side window is shown), unless that would push the player onto a loose window. A drop is not nudged: on Windows and macOS a user may drag the group partly off screen. The nudge is retried every 250 ms until the group fits, because a window manager ignores it while the user still holds the window. `scripts/e2e/dock.mjs` grows the player against the right edge of the work area and checks that the group shifts back and stays docked.

Why: The owner reported that docking breaks when a window is resized. With real pointer resizes on KDE (XWayland), growing the player pushed a docked side window past the screen edge. KWin keeps such a window inside the work area, so it landed somewhere the app had not asked for, and the app read that as a user drag: the side window was torn off its dock or left over the player. A resize that changed no position never settled either. KWin also ignored the nudge when it fired during a resize the user had paused but not released, so a single nudge was not enough.

## 2026-11-07 — Every window is resizable on its own

Decision: The playlist and album-art windows are user-resizable, each on its own, keeping its design aspect ratio (`setAspectRatio`). They no longer take the player's height: they open at the player's height the first time, then at their saved size, and a player resize leaves them alone. A docked window keeps its dock while it is resized: it is placed flush against its anchor again, so a drag on its docked edge grows it away from the anchor, and windows docked to it follow. A shaded window is not resizable and has no aspect lock until it is unrolled. Own-change detection compares the size as well as the position for resizes (`isOwn(w, true)`), because a user resize from the far corner keeps the position the app last set. Supersedes the 2026-11-06 "Side windows match the player's height" entry, except that the removed resize grip and `window:resize` IPC stay removed (the OS edges resize the window).

Why: The owner asked for every window to be resizable individually.

## 2026-11-07 — Fixed, proportional size limits for every window

Decision: Every window's height stays within 308..924 px, which is 50%..150% of the player's design height (616), and its width follows its own design aspect: the player is 384x308 to 1151x924, and the playlist and album-art windows are 308x308 to 924x924. The limits come from `sizeLimits` in `app/src/main/windowSize.ts` and are each window's min and max size. When a user resize ends, the window is brought back to its aspect and limits (`proportional`): the dimension the user changed most leads, and an edge the user moved stays where it is. The fix is retried until the window manager applies it, as the group nudge is. This replaces the playlist's 320 px and the album-art window's 240 px minimum widths. Saved bounds are clamped to the same limits.

Why: The owner asked for fixed, proportional minimum and maximum sizes for all windows. One height range for every window keeps the side windows at the same scale as the player at both ends (a side window at the player's height is the intended look). `setAspectRatio` alone was not enough: with real pointer resizes on KDE (XWayland), a right-edge drag of the player gave 528x394 instead of its 767:616 aspect.

## 2026-11-08 — Playlist font is Montserrat; long names scroll; the heading stays on top

Decision: The playlist's album heading and song rows use Montserrat, bundled as the variable font `assets/ui/playlist/fonts/Montserrat-VariableFont_wght.ttf` with its SIL Open Font License in `Montserrat-OFL.txt`. It replaces "Another Typewriter" from the 2026-11-07 entry, whose files are removed. The font stack is `'Montserrat', sans-serif`, and the sizes stay 32 px for the heading and 28 px for rows. Each row shows its full name as a tooltip (`title`). A selected row whose name is cut off scrolls to the end of the name and back (a marquee), starting 400 ms after selection (`marquee.ts`). The song list scrolls in a box that starts below the album heading, so the heading stays on top.

Why: The owner picked the font and asked for the tooltip, the delayed marquee and the fixed heading. Montserrat has the glyphs the typewriter font lacked. The marquee is skipped when the OS asks for reduced motion.

## 2026-11-08 — Playlist text keeps a fixed screen size

Decision: The playlist's album heading is 16 px and its song rows are 13 px on screen (`PLAYLIST.TEXT_PX` in `app/src/shared/layout.ts`), at every window size. Rows are 17 px tall (13 px × 1.3, rounded). Only the artwork scales when the window is resized, so a bigger window shows more songs instead of bigger text. The view divides these sizes by its scale (`textMetrics` in `playlistText.ts`), and the marquee speed is timed in screen px. This replaces the design-px sizes (32 px heading, 28 px rows, 36 px pitch) from the 2026-11-07 and earlier 2026-11-08 entries. A future settings page can change `TEXT_PX`; `textMetrics` already takes the sizes as a parameter.

Why: The owner wanted the text to stay the same size while the playlist is resized, and picked 13/16 px from an HTML preview of sizes 12/15, 14/17, 16/20 and 18/22 at the smallest, default and largest window.

## 2026-11-08 — Pressed keys use the disabled key's dark shade

Decision: Every pressed player key is drawn in the same dark shade as an unavailable key (`--key-dark: brightness(0.8)` in `CassettePlayer.css`): a key held down with the mouse, Rewind or Forward while seeking, Play latched while playing and Pause latched while paused. It stays dark under the mouse pointer. A pressed key still moves down 3 px. Pause and Stop keep the shade while nothing is playing, as before. Rewind, Play and Forward are not darkened while nothing is loaded, so on first boot only Pause and Stop look dark. This extends the 2026-11-01 entry, where pressed and latched keys only moved down and kept their full brightness.

Why: The owner asked for pressed keys to be darker, using the shade Pause and Stop show at startup, so one look says which key is down.

## 2026-11-08 — The player remembers the last session

Decision: Main saves the last track, its album folder (none for a single file), its index in the album and the position in `settings.json` as `session` (`app/src/main/session.ts`). It saves on every engine `state` event, every 5 s while playing and on quit. At startup it restores the session without playing: `loadAlbum` gained two optional fields, `index` (first track, default 0, out of range falls back to 0) and `play` (default `true`), and main sends `loadAlbum {index, play: false}` (or `load` for a single file) followed by `seek`. The player shows the track stopped at the saved position, and Play resumes there. Nothing is saved until the restore has reached the saved position (one track `state` per restore command, or an error), so quitting mid-restore cannot store the 0:00 of the load. A session whose file or folder no longer exists is dropped without an error. The session is not restored after an engine crash.

Why: The owner asked for the player to remember the last playlist, song and position so they can resume where they left off. Restoring through the engine's own commands keeps state engine-owned (the renderer still only shows engine events). Not autoplaying avoids surprise sound at login. Loading without play needs an engine change because `loadAlbum` always played.

## 2026-11-14 — A cassette rack window

Decision: A fourth window, the cassette rack (`rack`), is a side window built from the designer's "updated cassette rack" layers (`assets/ui/rack/`, design size 1623x936). It follows every rule in `docs/WINDOWS.md` through the shared satellite code: it opens at launch docked above the player (left edges aligned), at the player's height the first time; it snaps, tears off, shades to a 64 px bar, resizes in proportion within 534x308..1602x924, has no taskbar entry, and its bounds are saved as `rackWindow`. It shows only its frame and empty shelf for now: the sample cassette spines are a reference, and what the rack lists is not decided. It receives engine events like every window but sends no commands.

Why: The owner asked for the rack window's UI with all window behaviour first. Docking it above the player matches the designer's full preview, where the rack sits above the player and playlist.

## 2026-11-14 — A power deck window

Decision: A fifth window, the power deck (`power`), is a side window built from the designer's "updated power deck" layers (`assets/ui/power/`, design size 451x934). It follows every rule in `docs/WINDOWS.md` through the shared satellite code: it opens at launch docked to the right of the playlist (top edges aligned), so it follows the player through the playlist; at the player's height the first time; it snaps, tears off, shades to a 48 px bar, resizes in proportion within 149x308..446x924, has no taskbar entry, and its bounds are saved as `powerWindow`. Its controls (volume, seek bar, visualizer, loop, shuffle, import, power, meter) are artwork only for now. It sends no commands.

Why: The owner asked for the power deck's UI with all window behaviour first. The player already has windows on its left (album art), right (playlist) and top (rack), and the tall, narrow deck fits beside the playlist at the same height.

## 2026-11-14 — Power deck controls are engine-owned

Decision: Volume, Loop Song and Shuffle live in the engine. New commands: `setVolume {volume}` (0..1), `setLoop {on}` and `setShuffle {on}`. The engine sends `options {volume, loop, shuffle}` at start and after every set command. Volume is a gain of 0 at 0, otherwise 10^(2·(v−1)), so −40..0 dB. It is applied in the audio callback after the key-sound mix, so it changes the whole output. The `Playlist` keeps a play order. Shuffle puts the current track first and shuffles the rest, using a small xorshift seeded from the clock (no `rand` crate). `next` and `previous` moved into the engine, so the renderer's Forward and Backward clicks send them. Previous on the first track of the order restarts it. Loop Song reloads the same track when it ends, for an album or a single file. Main saves the options in `settings.json` (`Settings.options`, `app/src/main/options.ts`). When a fresh engine sends its first `options` event, main re-sends them as `setVolume`, `setLoop` and `setShuffle`. The three echoes of those commands are not saved, so a half-applied state is never written. Keyboard: Up/Down change the volume by ±0.05, L toggles Loop Song, S toggles Shuffle (player and power windows), and V switches the visualizer mode (power window). Space, Left and Right are unchanged. This supersedes the statement in the 2026-11-14 "A power deck window" entry that the controls are artwork only and that the window sends no commands.

Why: The engine already owns the transport and the queue, and the renderer must hold no authoritative state. Volume and the play order therefore belong with the audio, so they stay right when the renderer is frozen or reloaded. Main owns `settings.json`, so the renderer never writes files.

## 2026-11-14 — Output levels for the meter and visualizer

Decision: The audio callback pushes the post-gain output, mixed to mono, into a pre-allocated `rtrb` tap. When the tap is full, samples are dropped. The callback does no allocation, locking or logging. A thread owned by the `Output` reads the tap and runs a hand-written radix-2, 1024-point FFT (`player-core/src/levels.rs`), about every 30 ms. The thread is joined when the `Output` is dropped. The sidecar reads the latest levels on each position tick and sends a `levels {rms, peak, bands[16], wave[64]}` event, only while Playing (about 20 Hz).

Why: The VU meter and the visualizer must show what is actually being output, not a timer. A hand-written FFT for one size avoids adding `rustfft`, under the rule that a dependency is added only when needed. Sending levels with the position tick adds no new timer.

## 2026-11-14 — Code-drawn power deck states

Decision: Some power deck states have no artwork, so they are drawn in code over the baked layers. The seek bar fill and thumb are CSS. The Loop Song and Shuffle lamps are CSS glows, green when on and red when off. The Import Album lamp glows while its button is pressed. The VU needle is SVG, driven by rms and mapped from −40 dB at the "20" mark to 0 dB at the "100" mark. It covers the baked needle with the face colour `#b1ad9f` and redraws the pivot. The volume knob turns only its disc: a circular clip of `power-volume.png` rotates, so the printed 0–10 scale stays still. The baked pointer is part of that disc and turns with it. Each placeholder is listed in `docs/ASSETS_TODO.md` item 21, with the art that would replace it.

Why: The controls need to work now, and the art for their states was not supplied. Keeping each placeholder in its own view code means real art can replace it without changing the engine or the protocol.

## 2026-11-14 — Power button quits the app

Decision: The power button on the deck quits the app. It calls `RetroApi.quit()`, which sends IPC `app:quit`. Main accepts that only from an app window. The session is saved on quit, as before.

Why: The button needs a clear meaning, and quitting through the normal path keeps the session save that the 2026-11-08 entry relies on.

## 2026-11-14 — A native right-click menu on the player

Decision: A right-click anywhere on the player opens a native Electron menu (`Menu.popup`, built in `app/src/main/contextMenu.ts`). Its first item, Windows, lists every side window as a checkbox (ticked when visible); picking one shows or hides that window, so a closed window can be brought back. Closed side windows are saved as `hiddenWindows` in settings.json and stay closed at the next launch; showing one (from the menu or Ctrl+L) removes it from the list. Quitting does not count as closing. Settings, Check for Updates and About follow as placeholders that do nothing yet. On Windows, a right-click on the drag region raises `system-context-menu`, which is prevented and shows this menu instead of the OS window menu.

Why: This is an owner-approved exception to the "no native controls" rule. Most of the player is a drag region, and on Windows a right-click there never reaches the page, so an HTML menu would not open everywhere. A native menu also is never clipped by the window edge and gives checkboxes and submenus for free. The menu will grow, so only the template lives in the tested module.

## 2026-11-14 — The playlist and the cassette rack resize freely

Decision: The playlist and cassette rack windows resize in width and height independently (`free: true` in `satellites`): no `setAspectRatio`, no proportion fix when a resize ends, and saved sizes are fitted to the screen per dimension (`fitSize`). They keep the shared limits (height 308..924, width from the design aspect at those heights). Their views scale by the tighter side and grow the composition to fill the window (`stretchFit`), drawing each art layer nine-slice (`nineSlice`, borders in `PLAYLIST.SLICE` / `RACK.SLICE`) at whole screen pixels. The list area, cover and right-edge buttons follow the window. A shaded free window's bar keeps the scale its art had. The player, album and power deck still keep their design aspect. This changes rule 8 of `docs/WINDOWS.md` (owner request).

Why: Both windows hold lists (songs, cassettes) that are worth more room in one direction without growing in the other. Their art is plain frames with details in the corners and edges, so nine-slicing grows them without redrawing or distorting artwork; the other windows are fixed compositions where stretching would distort them.

## 2026-11-14 — The right-click menu opens only from the page's context-menu event

Decision: On every OS the right-click menu (`app/src/main/contextMenu.ts`) opens only from the page's `context-menu` event. On Windows and Linux, `system-context-menu` is still raised first over a drag region, but it is only `preventDefault()`ed to hide the OS window menu. `oncePerClick` is removed. This supersedes the once-per-click part of the 2026-11-14 "A native right-click menu on the player" entry and rule 9 of the side-window rules in `docs/WINDOWS.md` as they were.

Why: On Linux a menu popped from `system-context-menu` closed about 5 ms later, and on Windows two menus back to back left none open. One source for the menu avoids both.

## 2026-11-14 — Window sizes follow the display they are on

Decision: The height limits of a window come from the work area of its display (`displayLimits` in `app/src/main/windowSize.ts`). With `H` the work-area height: `minHeight = clamp(round(0.30·H), 200, 308)`, and `maxHeight = max(minHeight, min(round(0.90·H), 2 × the window's design height))`. Widths follow the design aspect. Free windows (playlist, rack) have `minWidth = minHeight`. The default player height (`defaultPlayerHeight`) is chosen so the default five-window group (album, player, playlist and power deck wide; rack and player tall) fits 75% of the primary work area. Limits are re-applied on `display-metrics-changed`, `display-added` and `display-removed`, and when a window's move ends on another display. A window out of range is clamped (`clampToLimits`: aspect kept, free windows per dimension) and stays docked. A shaded window is not resized; its limits apply when it is unshaded. Examples: a 1280x720 display (work area 680 px) gives 204..612 with a default player of 255; 1920x1080 (work area 1040 px) gives 308..936, default 386; 2560x1440 (work area 1400 px) gives 308..1232, default 515.

Why: The owner asked for a researched responsive system. The old fixed 308..924 px range fits a 1280x720 display badly, since the maximum is larger than its work area, and it is small on 2560x1440. The formula scales with the screen. Sources: the GNOME HIG (1024x600 is the smallest display to support), Microsoft (1366x768 is common, and layout uses effective pixels), and the Electron screen API (`workArea` in DIP, and display events). The WCAG 24 px target floor was not applied: the art's chrome buttons are 30 px in a 937 px design.

## 2026-11-14 — Tiling help: edge snapping and Fill Gaps

Decision: Three changes help windows fit together as tiles. (1) A dropped window aligns its start or end edge with the neighbour's, whichever is closer, within 12 px (`snap`). Before, only the start edge aligned. (2) When a user resize ends, each edge it moved snaps to a parallel edge of another window within 12 px (`snapResize` in `app/src/main/dock.ts`). Free windows snap per edge. Aspect windows snap by the most-changed dimension. This runs on every OS at resize end, because `will-resize` does not exist on Linux. (3) `Windows → Fill Gaps` (`fillGaps`) is an on-demand menu action. Inside the bounding box of the player's visible group, each visible free window grows right, down, left, then up until it meets another window (a shaded bar counts) or the box edge, within its limits. Aspect windows never change. The free-window minimum width is now `minHeight`, which is looser than the aspect width it had before.

Why: The owner wants windows arranged as tiles. Aligning either edge and snapping on resize make windows meet each other. The owner chose on-demand Fill Gaps over automatic filling, so the user keeps control of each size.

## 2026-11-14 — Reset Windows is a first launch

Decision: `Windows → Reset Windows` (`resetWindows`) does what a first launch does. All four side windows are shown and unshaded, `hiddenWindows` is cleared, the player goes to its default size on its display, the side windows go to the player's height, `DEFAULT_DOCKS` applies, the group is nudged onto the work area, and the bounds are saved once every window is shown.

Why: The owner chose to show closed windows too, so one action gives a known layout after windows have been closed or moved out of reach.

## 2026-11-14 — App font is Liberation Sans

Decision: Every window's code-drawn text (cassette title and time, hints, the open menu, the error toast, the debug view) uses Liberation Sans Regular, bundled as `assets/ui/fonts/LiberationSans-Regular.ttf` with its SIL Open Font License in `LiberationSans-OFL.txt`. `app/src/renderer/src/fonts.css` declares it and sets it on `body`, and views inherit it rather than naming a font. The playlist keeps Montserrat (`PLAYLIST.FONT_FAMILY`). The brand texts "SUPER LX- RETRO" (player and power deck) and "HIGH QUALITY AUDIO" (player) stay baked into the artwork, where the artist set them in Hillside Sans. No Hillside font file is bundled. `app/test/appFont.test.ts` checks this, including that those art layers are the originals.

Why: The owner picked Liberation Sans from the artist's set. Drawing the brand text in Hillside by code was tried and removed: the repository is public, so committing the font file would publish it, and Hillside's licence (the file says personal use only) does not allow that. The baked art already shows the brand text in Hillside.

## 2026-11-14 — Playlist title drawn like the rack title

Decision: The playlist's window title is drawn by code as "TRACK LIST" in Liberation Sans, with the "CASSETTE RACK" title's position, cap height, letter spacing and colour (`RACK_TITLE`, `#737373`, measured from `rack/rack-top.png`; `PLAYLIST.TITLE`). The red "Track List" is erased from `playlist/playlist-base.png`; its dashes stay. The title (`TitleText`) is trimmed to cap top and baseline (`text-box: trim-both cap alphabetic`), so a measured cap top places it exactly. The old unused `PLAYLIST.TITLE` measurements of the red title are removed.

Why: The owner wants the playlist title in the app font and the rack title's colour. Copying the rack title's whole look keeps the two side windows' titles identical in size and placement.

## 2026-11-14 — Volume knob: grab cursor and click to turn

Decision: The volume knob shows the grab cursor (grabbing while held). A press that moves less than 3 design px is a click, and it turns the knob to point at the click (`angleVolume`): straight up is 5, the lower-left mark 0, the lower-right mark 10, the gap at the bottom snaps to the nearer end, and the centre does nothing. The clickable circle is 140 design px in radius, covering the knob and its ring of scale dots. Vertical drag, wheel and arrow keys stay as they were. Only the left button turns it, so a right-click still opens the menu.

Why: The owner wants to grab the knob and to set the volume by clicking on or around it, like a real dial.

## 2026-11-14 — Cassette rack keeps an album history

Decision: Every album that is loaded (folder dialog, folder drop on the player, session restore, a click in the rack) or dropped on the cassette rack gets a spine in the rack. A single song never does, and one album folder has one spine. A spine is a centre strip of the album cover at the reference aspect 211:1527, cropped in the main process with Electron `nativeImage` (crop, downscale to 400 px tall, JPEG at quality 82). No new dependency. With no cover, the spine is a solid colour from a hash of its text. The text is "Artist - Album (Year)", with missing parts dropped and an untagged title replaced by the folder name, set in Montserrat (the playlist font), rotated to read top to bottom. Its colour is black or white, whichever has the higher WCAG contrast against the strip's mean colour. The history is stored in `rack.json` in userData, separate from `settings.json`, and holds only the small spine JPEG data URLs, never full covers. It is `{sort, entries: [{dir, text, image, bg, ink, lastUsed}]}`; array order is the custom order. Writes are atomic. The sort mode is Recent (default, by `lastUsed` descending, and any album load bumps it) or Custom (spines are dragged to reorder, the order is kept while in Recent, and new albums append at the end). Right-clicking a spine removes it from the rack. Clicking a spine loads the album and plays it; if its folder no longer exists, the spine is removed silently. Dropping a folder on the rack adds it without playing: main sends the new engine command `scanAlbum {path}`, which answers `albumInfo {path, album|null}` and never touches playback (see `docs/PROTOCOL.md`).

Why: The owner wants the rack to remember the albums they play, like cassettes on a shelf. Keeping the history in its own file keeps `settings.json` small and lets it be written on its own. Cropping the cover in the main process with the Electron API adds no dependency and keeps the spine small enough to store. `scanAlbum` lets a dropped folder be added without interrupting the music. The sort modes let the owner see recent albums first, or arrange the shelf by hand.

## 2026-11-14 — Cassette rack: click, preview, hover and "+" spine

Decision: A double-click on a spine loads the album and plays it, with no preview. A single click opens a read-only tracklist preview after 300 ms (`PREVIEW_DELAY_MS`), so a double-click can cancel it; a triple-click does nothing extra. Enter on a focused spine plays it, and Space toggles the preview. A drag (reordering in Custom sort) never opens a preview or plays. The preview slides out sideways to the right of the spine, over its neighbours, at full spine height, and flips left near the right edge. It reuses the playlist's track rows (the shared `TrackRows` component). Any other interaction with the rack closes it: a click outside it, the wheel on the shelf, a right-click, a drag start, Escape, window blur, or playing. Scrolling inside the preview keeps it open. The preview's tracklist comes from the new IPC `rackTracks(dir)` (`rack:tracks`): main sends the engine `scanAlbum` and waits for its `albumInfo` (5 s timeout). That answer is not recorded, so previewing never moves an album to the front of Recent. A missing or unreadable folder removes the spine silently. The cover is not sent with the reply. Hover lifts a spine slightly, as if pulled out of the rack, and the previewed spine stays lifted. While reordering, the drag image is 1.05× the spine's on-screen size, because Chromium's default drag image ignored the window's CSS scale and looked huge. A transparent "+" spine is always last in the row; it opens the folder picker and adds the album to the rack without playing it. Deferred: double-clicking a track row in the preview could play the album from that track. For now the preview is read-only.

Why: The owner wants a single click to show what is on a cassette without disturbing playback, and a double-click to play it. The delay keeps the two gestures apart. Previewing must not reshuffle Recent, so the preview's scan is never recorded.

## 2026-11-14 — Cassette rack preview: OS double-click time and polish

Decision: The single-click tracklist preview now waits the OS double-click time instead of a fixed 300 ms. The main process reads it once at startup (`app/src/main/dblclick.ts`), and the rack gets it over `doubleClickMs()` (`os:doubleClickMs`). It replaces the 300 ms `PREVIEW_DELAY_MS` in the entry above; the default is now 500 ms. The value is read per OS, each with `execFile` (no shell) and a 2 s timeout:
- Windows: `reg query "HKCU\Control Panel\Mouse" /v DoubleClickSpeed`.
- macOS: `defaults read -g com.apple.mouse.doubleClickThreshold` (seconds).
- Linux: on KDE, `kreadconfig6` or `kreadconfig5 --group KDE --key DoubleClickInterval`; otherwise `gsettings get org.gnome.desktop.peripherals.mouse double-click`.

The value is clamped to 150–1000 ms, and 500 ms is used when it cannot be read. A preview scan's `albumInfo` is never recorded, even when it arrives after the 5 s timeout. The waiter counts the scans it has sent per folder, because the engine answers them in order, and the count is cleared on `engine_crashed`. The preview slides in with a CSS transition, so closing it mid-slide reverses smoothly. Read-only rows are plain elements, with no focus and no hover highlight.

Why: Chromium counts a second click as a double-click using the OS setting. Matching that setting means a double-click never flashes a preview, and a single click is no slower than it needs to be. Electron has no API for this value, so it is read from the OS. Previewing must never reshuffle Recent, so late scan answers are dropped.

## 2026-11-14 — Track names: drop the artist except on mixtapes

Decision: In the playlist and the rack preview, an album's rows read "01. Title". A mixtape is a folder whose tracks do not all share one artist, and its rows read "01. Artist – Title". A track's effective artist is its own artist, else the album artist, and unknown artists are ignored. `mixedArtists(album)` decides the folder kind, and `trackRowName(track, i, showArtist, albumArtist)` in `app/src/renderer/src/views/trackRowName.ts` builds the row. Single files have no playlist rows.

Why: On a one-artist album the artist repeats on every row and is noise. On a mixtape the artist is the only thing that tells the tracks apart.

## 2026-11-14 — Volume knob turns, not drags

Decision: Dragging the volume knob turns it like a real dial. The angle the pointer travels around the knob's centre turns it (`pointerAngle` and `turnVolume` in `app/src/renderer/src/views/powerMath.ts`), and each move applies its own change. The knob stops at 0 and 10 with no wrap, and grabbing never jumps. This replaces the vertical drag (`dragVolume`, now removed), so it supersedes the vertical-drag part of "Volume knob: grab cursor and click to turn" above. A click without moving still points the knob at the click, and the wheel and arrow keys are unchanged.

Why: A vertical drag does not match how a dial is turned. Following the pointer's angle does, and applying each move's change stops cleanly at the ends.

## 2026-11-14 — Volume boost with a look-ahead limiter in the output callback

Decision: Boost adds 0, +3, +6, +9 or +12 dB (Off by default) to the music, for quiet tracks. The gain goes through a look-ahead peak limiter so it never clips: look-ahead 1.5 ms, release 80 ms, ceiling -1 dBFS sample peak, gain ramped over 20 ms, channels linked (`engine/crates/player-core/src/limiter.rs`). It runs inside the cpal output callback on the music only, before key sounds are mixed and before the knob volume. It is preallocated, so the callback does no allocation, and it resets when the output buffer is cleared (seek, load, stop). At Off the music passes bit-identical, only delayed 1.5 ms. At exactly 0 dB nothing is limited, by design. The knob's curve (-40..0 dB, max 1.0) is unchanged, and the knob only attenuates. Protocol: the command `setBoost {boostDb}` (the engine clamps to [0,12]), and the `options` event gains `boostDb`. It is saved with the other options in `settings.json` (a file without it loads as Off) and re-sent after an engine restart. It is set from the right-click menu's "Volume boost" radio submenu or the BOOST lamp on the power deck.

Why: Plain gain with a hard clip (what VLC does above 100%) distorts loud peaks. Rejected: extending `setVolume` to 0..2, which breaks the 1.0 = bit-perfect clamp. Rejected: placing the boost in the DspChain. The DspChain sits before the ~2 s output ring, so a change would be heard about 2 s late, and before the resampler, which can push peaks past any limiter. Auto-normalize (ReplayGain, an R128 scan, or compression) is deferred. Research and alternatives are in `docs/research/2026-11-14-volume-boost.md`.

## 2026-11-20 — Windows fit small screens: flat 200 px minimum height, first-run size about 60% of the work area

Decision: The minimum window height is a flat 200 px (was `clamp(0.30·H, 200, 308)`). With no saved bounds, or saved bounds that no longer fit the display's work area (taller or wider than it, or mostly outside it: `fitsWorkArea`), a window opens at `initialHeight(designH, H)`: `min(designH, round(0.6·H))`, within [200, maxHeight], aspect kept. It never exceeds the design size, so large screens with a saved size that fits look exactly as before. `maxHeight` is unchanged except it stays at least 200. The user approved this change to the window-size rule in `docs/WINDOWS.md` rule 8.

Why: On small screens (laptops, 1280x680 work areas) the old minimum and default made the group too big to use. All renderers scale their design composition to the window, so any size renders correctly.

## 2026-11-20 — Keyboard: S is Stop, shuffle moves to Shift+S, N and P play the seek sound

Decision: The S key now stops, exactly like the Stop button, with its sound. Shuffle moves to Shift+S. N and P (next and previous track) now play the seek sound. This supersedes the earlier entry that says S toggles shuffle; that entry is left as written. Requested by the user.

Why: S for Stop matches the button and the other transport keys, and shuffle is the less frequent action, so it takes the modifier.

## 2026-11-20 — Attached windows are 2 px apart

Decision: Attached windows leave a 2 px gap between them, not a flush edge. `GAP = 2` in `app/src/main/dock.ts` is in DIP, so the gap is the same logical size at any display scaling. Snap, place, layout, snapResize and fillGaps all leave exactly this gap, including at corners where three windows meet. Dock inference accepts windows 0 to 3 px apart, so an older flush layout re-docks and gets the gap. The windows are transparent, so the desktop shows through the gap. Detached windows have no gap rule. This supersedes every flush-edge rule in the earlier entries, and the "snaps flush" and "placed flush" wording in `docs/WINDOWS.md` and `docs/ARCHITECTURE.md` is changed to match.

Why: The gap keeps attached windows visibly separate at every display scale, and setting it in DIP keeps it the same size on every screen. The brief gave no owner reason, so this is recorded as the reason the code uses.

## 2026-11-20 — Side-window chrome is drawn at a fixed scale

Decision: Side-window chrome is drawn at one fixed scale, `CHROME_SCALE = 0.55` in `app/src/shared/chrome.ts`. Before, each view drew its whole design composition, title bar included, inside one `scale(fit)` transform that followed the window size, so the bar, title, borders and minimize and close icons grew and shrank with the window. The album and power windows split the composition at design y = `barH`. The bar is drawn at `CHROME_SCALE` and nine-sliced to the window width, and the body below scales with the window. The window keeps `w / (h − extraH) = designW / (designH − barH)`, with `extraH = barH · 0.55`. On macOS this is `setAspectRatio` with `extraSize`. On Windows and Linux a live whole-window aspect lock is refreshed for each height, with a correction at resize end, so a long drag can jump slightly at the end. The playlist and rack are drawn at `CHROME_SCALE` as a whole, and resizing shows more or less area. Their nine-slice frames also hold the paper and cover edges, so splitting them would misalign the frame. The owner chose this over misaligned frames or new art. New minimum sizes: playlist 220x218 and rack 330x178 DIP (`app/src/shared/freeMin.ts`). A shaded window's bar is `round(barH · 0.55)` at any size. The player is unchanged, because its bezel is product art. Limitation: the power window's side and bottom border is baked into its body art and still scales; only its title bar is fixed. This changes how the 2026-11-14 "The playlist and the cassette rack resize freely" entry scales its chrome: the chrome no longer grows with the window.

Why: Chrome that grows and shrinks with the window changes the title and icon sizes on every resize, and the frames stop matching the design. A fixed chrome scale keeps them the same at every window size.

## 2026-11-20 — Window lock moves and resizes the attached group

Decision: A "Lock Windows" checkbox, the last item of the player menu's Windows submenu, locks the group. It is enabled only when every visible window is attached in the player's group, or when it is already on. Turning it off is always allowed and changes no geometry. The state is saved as `windowsLocked` in `settings.json`, restored at startup, and cleared (saved false) if the restored layout is not one attached group. It is sent to every window over `window:locked`, and read with `window:getLocked`. While locked: dragging any window moves every visible window in the group together, with no tear-off, no snap and no dock change. A single move report that jumps more than 200 px is ignored, unless the next report agrees or the position holds for 50 ms. Resizing any window resizes the group by one factor at resize end (`groupResize` in `dock.ts`). Display changes resize the group as a whole and keep it on screen (`fitGroup`), never one window alone. Windows docked to a hidden window are re-anchored to the nearest visible ancestor for layout. The album and power empty areas become drag surfaces only while locked, with every button `no-drag`. Rack and playlist content never drags. This is an approved change to side-window rule 4 (resizing one window leaves the others alone), rule 5 (one drag region only), docking rule 4 (tear-off) and the snap-on-drop rules in `docs/WINDOWS.md`. Limitation: on macOS no move events arrive during a drag, so the group follows at the drop, and group resize applies at resize end, so windows can overlap briefly during a drag. Untested on Windows and macOS.

Why: A locked group behaves as one unit, so windows cannot be pulled apart by accident. The lock is offered only when every window is attached, so it always starts from one group. The 200 px and 50 ms filter handles openbox's bogus move reports.

## 2026-11-20 — Clearing the cassette rack also drops the global session

Decision: The rack's right-click menu has `Clear cassette rack…`, disabled when the rack is empty. A native confirm (Cancel is the default) says it removes all N cassettes and their saved progress, and does not delete music files. Clear All empties `rack.json`, which holds every per-album resume point, and drops the global `session` in `settings.json`. It sends no engine command, so playback continues. While the album that was playing at clear time stays loaded, no session or resume is saved for it. Loading or re-importing any album resets that, and a re-imported album starts fresh.

Why: This is the owner's decision. Without dropping the global session, session restore would bring the cleared album back at the next launch. Saving nothing for the loaded album stops its progress from returning the cleared entry while it still plays.

## 2026-11-21 — Every window's minimum height is 200

Decision: Every window (player, album, power, playlist and rack) has the same minimum height, 200 px, so docked windows can always line up with the player at the smallest size. The playlist's minimum composition is lowered (FREE_MIN_COMP.playlist.h 395 -> 363), and at 200 px tall its list still fits about 4 rows. The rack's minimum height rises from 178 to 200. Minimum widths are unchanged: playlist 220 and rack 330 DIP from `freeMin.ts`, album and power from their aspect.

Why: The playlist's 218 px minimum was taller than the player's 200, so at the smallest size the playlist could not line up with the player's bottom edge. That broke the default layout on small screens and the dock E2E on the 1024 px Windows and macOS CI runners. `resetWindows` also now plans with the free windows' real minimums; it used the 200 floor while the native window enforced 220x218, so the power deck overlapped the playlist after a display change.

## 2026-11-21 — Album Edit is a separate dialog window, outside docking and the lock

Decision: The Album Edit window (`#edit`) is a frameless dialog window. It is not a side window: it never docks, never counts toward the window lock, is not in `openIds` or `hiddenWindows`, and never restores on restart. See `docs/WINDOWS.md`, Album Edit window.

Why: A short-lived editor should not have to dock to keep the lock valid.

## 2026-11-21 — Per-album customisation lives on the rack entry

Decision: Each album's cassette design and customisation (`design`, and `custom` with the cover, spine offset, spine colour, ink and text) are stored on its rack entry in `rack.json`, keyed by album folder. They are not stored in `settings.json`. See `docs/ARCHITECTURE.md`, Rack history.

Why: The rack already holds one record per album, so the look belongs to the album. Old `rack.json` files load unchanged, because the new fields are optional.

## 2026-11-21 — Custom covers are copied into userData under a content hash

Decision: A custom cover is picked in a native dialog in main, decoded and scaled there, and written to `userData/covers/<first 32 hex of sha256>.jpg` on save. The renderer never sends a file path or a cover file name. See `docs/ARCHITECTURE.md`, Album edit.

Why: The renderer must not read or name files, as the security rules say. A content hash names each cover once, so the same image is stored once.

## 2026-11-21 — Eight new cassette designs ship as PNGs; CSS redraw is deferred

Decision: The eight new cassette designs (`assets/ui/all basic cassette/`) ship as PNGs resized from the provided art, the same way as the original cassette. A redraw of all nine cassettes in HTML and CSS was requested. It is deferred to its own plan, `docs/plans/2026-11-21-css-cassettes.md`, and needs the owner's approval per design.

Why: The PNGs match the artwork the owner supplied, so the batch can ship now. `AGENTS.md` says not to redraw final artwork without approval, so a redraw waits for it.

## 2026-11-21 — Visualizer mode is saved globally

Decision: The visualizer mode (`bars` or `wave`) is saved once in `settings.json` as `visualizerMode`. It is read and set over `ui:getVisualizerMode` and `ui:setVisualizerMode`. It is not per album, and it is not an engine option.

Why: The visualizer is a display choice, not a property of the album. A global value is the simplest one that survives a restart.

## 2026-11-21 — Playlist border drag under the lock is not changed

Decision: Letting the playlist border drag while the windows are locked was considered, and it was not changed. The rule that rack and playlist content never drags stays (`docs/WINDOWS.md`, Window lock, rule 8). This is the owner's choice.

Why: The owner chose to keep the rule. A change to a window rule needs the owner's approval.

## 2026-11-21 — Power-deck visualizer freezes under the lock on Windows

Decision: under the window lock, a no-drag `.pd::after` box over the visualizer (PowerView.css, a copy of POWER.VIS) cuts the drag hole; the `.pvis` rule on the `<svg>` alone cuts none.

Why: Chromium does not collect an outer `<svg>` box as a no-drag region, and the full-size layer images after it inherit drag, so a hole must be the last child of `.pd`. On Windows a drag region is HTCAPTION, so the OS swallowed every click and the visualizer looked frozen. Reproduced with real XTest drags on Linux X11 too. The dock E2E checks it with a real OS click, since CDP input skips the OS hit test.
