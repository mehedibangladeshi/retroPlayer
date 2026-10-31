# Project: Cassette Player (working name)

A desktop music player with a cassette-tape UI. Phase 1 is a minimal player: import an audio file, play it, and control it with play, pause, stop, forward and backward, while an animated cassette plays on screen.

The long-term product is a lossless audio player with an equalizer and several floating, snappable windows (player, equalizer, playlist, library), later ported to mobile. Phase 1 must not block that future, but must NOT build it yet.

## Locked architectural decisions (do not change without asking me)

1. **Audio engine = Rust. UI = Electron + TypeScript + React.**
2. **The engine runs as a separate sidecar process**, not a Node addon. The UI is a thin client. If the UI freezes or crashes, audio keeps playing.
3. **All audio work happens in Rust**: decoding, DSP, resampling, output. Audio samples never pass through JavaScript.
4. **Never use the Web Audio API or `<audio>` / `<video>` elements** for playback, even for previews or tests. They resample and prevent bit-perfect output.
5. **The engine core is a pure library crate** (no Electron, no stdio, no UI concepts) so it can be reused in iOS and Android apps later. The sidecar binary is only a thin wrapper that exposes it over IPC.
6. **The UI must look identical on Windows, macOS and Linux.** All visuals come from our own SVG/PNG assets and CSS, not native controls. No OS-specific styling.
7. **Multi-window is a future requirement.** Design the renderer so that the player view is a self-contained component that gets all state from the engine over IPC and holds no authoritative state itself. Then a future second window can show the same state. Do not implement multiple windows now.
8. Package manager: **pnpm**. Node: current LTS. Rust: stable toolchain.

## Repository structure

```
/
├─ AGENTS.md                  (this file)
├─ CLAUDE.md                  ("Read and follow AGENTS.md")
├─ docs/
│  ├─ ARCHITECTURE.md         (process model, threads, data flow)
│  ├─ PROTOCOL.md             (engine <-> UI message spec, the source of truth)
│  ├─ DECISIONS.md            (log of decisions and why, append only)
│  └─ ROADMAP.md              (phases; later phases listed but not started)
├─ engine/                    (Cargo workspace)
│  ├─ Cargo.toml
│  ├─ crates/
│  │  ├─ player-core/         (lib: decode, ring buffer, output, state machine)
│  │  └─ engine-sidecar/      (bin: stdin/stdout JSON protocol around player-core)
├─ app/                       (Electron app, electron-vite + React + TS)
│  ├─ src/main/               (Electron main: window, file dialog, spawns sidecar)
│  ├─ src/preload/            (typed, minimal contextBridge API)
│  └─ src/renderer/           (React UI)
└─ assets/
   └─ ui/                     (see Assets section)
```

## Engine rules (Rust)

- Decoding: `symphonia` with FLAC, WAV, MP3, AAC/M4A (incl. ALAC), OGG/Vorbis enabled.
- Output: `cpal`. Use the device's native sample rate. If the file's rate differs, resample with `rubato`. Process in f32 internally.
- Threading: a decoder thread fills a lock-free ring buffer (e.g. `rtrb`). The audio callback only reads from that buffer. **No allocation, locking, logging, or blocking calls inside the audio callback.**
- The player is a state machine: `Empty -> Stopped -> Playing <-> Paused`.
- Semantics:
  - `play`: starts or resumes. `pause`: holds the position. `stop`: halts and resets position to 0.
  - `seek(ms)`: absolute seek. The UI's forward/backward buttons call seek relative to the current position (clicking = +/-10 seconds; holding repeats). Clamp to [0, duration].
  - When a track ends, emit `ended` and move to `Stopped`.
- Errors (unsupported format, missing file, no output device) must be reported as protocol `error` events, never panics.
- Include unit tests for the state machine and seek clamping, and one integration test that decodes a small bundled WAV fixture.
- Design the DSP stage as an explicit (currently empty) chain between decoder and output, so an EQ can be inserted later without restructuring. Do not implement an EQ now.

## Protocol rules (engine <-> UI)

- Transport: newline-delimited JSON (one JSON object per line) over the sidecar's stdin/stdout. stderr is for logs only.
- Define every message in `docs/PROTOCOL.md` first, then implement it, with matching TypeScript types and Rust types.
- Commands (UI to engine): `load {path}`, `play`, `pause`, `stop`, `seek {positionMs}`, `seekRelative {deltaMs}`.
- Events (engine to UI): `state {status, positionMs, durationMs, trackInfo}`, `position {positionMs}` (about 20 Hz while playing), `ended`, `error {code, message}`.
- Every message includes a protocol `version`. Unknown messages are ignored and logged, not crashes.

## UI rules (Electron + React)

- Security: `contextIsolation: true`, `nodeIntegration: false`, a minimal typed preload API. The renderer never spawns processes or reads files directly.
- The main process spawns and supervises the sidecar (restart on crash, surface the error in the UI) and owns the native "open file" dialog.
- File import: an "Open" button (native dialog filtered to supported audio) and drag-and-drop of a file onto the window. Both result in a `load` command and then an automatic `play`.
- Phase 1 window: one fixed-size, non-resizable window, standard OS frame is fine for now (custom frameless chrome comes with the multi-window phase).
- The UI shows the cassette, five buttons (play, pause, stop, backward, forward), the track name, and elapsed/total time. Buttons are disabled when they do not apply (e.g. nothing loaded).
- Cassette animation: the reels rotate only while status is `Playing`, stop smoothly on pause or stop, and spin faster while a seek button is held. Use CSS or SVG transform animation, not canvas. Tape amount on each reel may shift with progress if the asset layers allow it (nice-to-have).
- State comes from engine events only. Do not predict or keep a separate clock in the UI beyond smoothing the displayed position between `position` events.
- Keyboard: Space = play/pause, Left/Right = backward/forward.

## Assets

I will provide UI assets in `assets/ui/`:
- `assets/ui/svg/`: individual layers as SVG (cassette body, left reel, right reel, tape, window/glass, labels, each button in normal / pressed / disabled states).
- `assets/ui/png/`: PNG exports of the same layers at 2x.
- `assets/ui/reference/full-ui.png` (and/or `full-ui.svg`): the complete composed design. This is a **visual reference only** and must not be shipped as the UI.

Rules:
- Prefer individual SVG layers. Use PNG only where SVG cannot represent the look (textures, soft shadows).
- Compose the UI from layers in code so reels and buttons can be animated and states swapped.
- If an asset is missing, use a simple placeholder shape and list it in `docs/ASSETS_TODO.md`. Do not invent or redraw final artwork.
- Create `assets/ui/MANIFEST.md` listing every file, what it is, and its intended anchor/position in the composition, derived from the reference image.
- Optimize SVGs only if the result renders identically.

## Phase 1 scope and acceptance criteria

In scope:
1. Repo scaffold exactly as above, with a working dev workflow (`pnpm dev` starts Electron and builds and launches the sidecar).
2. Basic cassette UI built from the assets.
3. Working play, pause, stop, forward, backward.
4. Import a local audio file (dialog and drag-and-drop) and play it through the Rust engine.

Out of scope for now (do not build, do not add dependencies for them): equalizer or tone controls, playlist, library, multiple windows, mobile, streaming, cover-art extraction, settings, bit-perfect or exclusive mode.

Done means all of these are true:
- A FLAC, a WAV and an MP3 each import and play correctly on my machine.
- All five buttons work and reflect real engine state; the reels animate correctly for each state.
- Audio keeps playing if I freeze the renderer (verify by blocking it in DevTools).
- Errors (bad file, no audio device) show a readable message instead of crashing.
- `cargo test`, `cargo clippy -- -D warnings`, `pnpm typecheck` and `pnpm lint` pass.
- `docs/` is up to date, including the protocol and the decision log.

## How to work

1. **First, plan.** Before writing code, read this file and produce a short plan with the task breakdown. Wait for my approval of the plan if anything below is unclear or you want to deviate from it.
2. Build in this order: scaffold and docs -> engine core with tests -> sidecar and protocol -> Electron shell spawning the sidecar (with a plain debug UI) -> asset-based cassette UI -> polish.
3. Commit in small, working steps with clear messages. The project must build after each step.
4. Add a dependency only when needed, and record it in `docs/DECISIONS.md` with the reason.
5. If a requirement here conflicts with reality (e.g. a crate limitation), stop and tell me. Do not silently change a locked decision.
6. When you finish a task, state what you verified and how, and anything you could not verify (e.g. a platform you could not test).
7. Keep code simple and commented where the reasoning is not obvious, especially anything real-time or cross-process.
