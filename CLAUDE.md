# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

The full project spec, locked architectural decisions and working rules are in AGENTS.md, imported below. Follow it. Where it says "ask me" or "stop and tell me", ask the user before deviating.

@AGENTS.md

## Commands

Run all commands from the repo root. Per-OS setup (macOS, Linux, Windows) is in `docs/DEVELOPMENT.md`.

- `pnpm install`: install JS deps (pnpm 12; Electron and esbuild build scripts are allow-listed in `pnpm-workspace.yaml`).
- `pnpm dev`: builds the engine sidecar (cargo, debug), then starts electron-vite dev. The app spawns `engine/target/debug/engine-sidecar`. Override the path with `RETRO_SIDECAR=/path`.
- `pnpm build`: production build of the Electron app into `app/out`. Run it with `cd app && pnpm exec electron .`.
- `pnpm package`: release-builds the sidecar, stages it into `app/build/sidecar/`, and bundles the app for the host OS into `app/dist/`. Windows and macOS bundles come from the `package` GitHub Actions workflow (run it by hand, or push a `v*` tag to get a draft release). Tester install notes: `docs/TESTING.md`.
- `pnpm typecheck`, `pnpm lint`.
- `cargo test --manifest-path engine/Cargo.toml --workspace`: all Rust tests (no audio device needed).
- `cargo test --manifest-path engine/Cargo.toml -p player-core -- --ignored`: playback tests that need an audio device (they play a short quiet tone).
- `cargo clippy --manifest-path engine/Cargo.toml --all-targets -- -D warnings`.

Single tests:

- `cargo test --manifest-path engine/Cargo.toml -p player-core --test decode_wav opens_and_reports_metadata`: one integration test by name.
- `cargo test --manifest-path engine/Cargo.toml -p player-core state::tests`: unit tests by module path.
- `cargo test --manifest-path engine/Cargo.toml -p engine-sidecar --test stdio`: the stdio integration tests.

No JS test runner is set up. Renderer behaviour was verified by driving the built app over the Chrome DevTools Protocol (`electron . --remote-debugging-port=<port>`).

## Layout notes

- The protocol source of truth is `docs/PROTOCOL.md`. The Rust types are in `engine/crates/engine-sidecar/src/protocol.rs` and the TypeScript types in `app/src/shared/protocol.ts`. Change all three together.
- Window geometry and artwork positions live in `app/src/shared/layout.ts`. It is generated from `assets/ui/source` (see `assets/ui/MANIFEST.md`).
- Main-process settings (window bounds, full screen, last Open folder) live in `settings.json` under userData (`app/src/main/settings.ts`). The renderer scales the fixed 767x616 composition to the window (`CassettePlayer.tsx`), so layout.ts coordinates stay in design px.
- The debug view opens with the URL hash `#debug` (`app/src/renderer/src/App.tsx`).
- Plans and history are in `docs/plans/`.
