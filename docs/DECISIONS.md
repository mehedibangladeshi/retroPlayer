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
