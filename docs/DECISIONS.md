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

| Crate / package | Used for | Why |
|---|---|---|
| `symphonia` (Rust) | Decoding FLAC, WAV, MP3, AAC/M4A (incl. ALAC), OGG Vorbis | One pure-Rust library covers all required formats. |
| `cpal` (Rust) | Audio output at the device's native rate | Cross-platform output on Windows, macOS and Linux, and no resampling when the rates match. |
| `rubato` (Rust) | Resampling when the file rate differs from the device rate | High-quality resampling, used only when needed. |
| `rtrb` (Rust) | Lock-free single-producer, single-consumer ring buffer between decoder and audio callback | The audio callback can read without locking or blocking. |
| `serde` (Rust) | Derive-based types for the protocol | Standard serialization for Rust. |
| `serde_json` (Rust) | Encoding and decoding NDJSON protocol lines | Standard JSON for Rust, used with serde. |
| `electron` (JS) | Desktop shell: window, native file dialog, process spawning in main | Cross-platform desktop app with the same UI on all three OSes. |
| `electron-vite` (JS) | Dev server and build for main, preload and renderer | Standard build setup for Electron with Vite. |
| `vite` (JS) | Bundler and dev server used by electron-vite | Used by electron-vite; fast dev reloads. |
| `react` (JS) | Renderer UI | Component model for the cassette UI and the debug view. |
| `react-dom` (JS) | Renders React into the renderer window | Required by React for the browser. |
| `typescript` (JS) | Strict typing for the renderer, preload, main and shared protocol types | Catches protocol mismatches at compile time. |
| `eslint` (JS) | Linting | Enforces code quality for `pnpm lint`. |
| `typescript-eslint` (JS) | TypeScript rules for ESLint | Lints TypeScript sources with type-aware rules. |
