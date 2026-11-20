# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

The full project spec, locked architectural decisions and working rules are in AGENTS.md, imported below. Follow it. Where it says "ask me" or "stop and tell me", ask the user before deviating.

@AGENTS.md

## Commands

Run all commands from the repo root. Per-OS setup (macOS, Linux, Windows) is in `docs/DEVELOPMENT.md`.

- `pnpm install`: install JS deps (pnpm 12; Electron and esbuild build scripts are allow-listed in `pnpm-workspace.yaml`).
- `pnpm dev`: builds the engine sidecar (cargo, debug), then starts electron-vite dev. The app spawns `engine/target/debug/engine-sidecar`. Override the path with `RETRO_SIDECAR=/path`.
- `pnpm build`: production build of the Electron app into `app/out`. Run it with `cd app && pnpm exec electron .`.
- `pnpm package`: release-builds the sidecar, stages it into `app/build/sidecar/`, and bundles the app for the host OS into `app/dist/`. Windows and macOS bundles come from the `package` GitHub Actions workflow (run it by hand, or push a `v*` tag to get a draft release). Its `check` job (typecheck, lint, `pnpm test`, cargo test, clippy) must pass before any bundle is built, and a tag must match `app/package.json`'s version without the suffix (`v0.1.2-beta` for 0.1.2), so bump the version first. Tester install notes: `docs/TESTING.md`.
- Pre-commit hook: `scripts/git-hooks/pre-commit` runs typecheck, lint, JS tests, cargo test and clippy and blocks a failing commit. `pnpm install` enables it (the `prepare` script sets `core.hooksPath`). The TDD rule lives in AGENTS.md item 8.
- `pnpm typecheck`, `pnpm lint`, `pnpm test` (Node's `node:test` over `app/test/`, TypeScript run natively by Node 26).
- `cargo test --manifest-path engine/Cargo.toml --workspace`: all Rust tests (no audio device needed).
- `cargo test --manifest-path engine/Cargo.toml -p player-core -- --ignored`: playback tests that need an audio device (they play a short quiet tone).
- `cargo clippy --manifest-path engine/Cargo.toml --all-targets -- -D warnings`.

Single tests:

- `cargo test --manifest-path engine/Cargo.toml -p player-core --test decode_wav opens_and_reports_metadata`: one integration test by name.
- `cargo test --manifest-path engine/Cargo.toml -p player-core state::tests`: unit tests by module path.
- `cargo test --manifest-path engine/Cargo.toml -p engine-sidecar --test stdio`: the stdio integration tests.

JS unit tests use Node's built-in `node:test` (no dependency); they live in `app/test/` and run with `pnpm test`. Renderer behaviour was verified by driving the built app over the Chrome DevTools Protocol (`electron . --remote-debugging-port=<port>`). Window docking has a live E2E: after `pnpm build`, `node scripts/e2e/dock.mjs app /abs/throwaway-profile [--ozone-platform=x11]` (CI: `.github/workflows/dock-e2e.yml` on Linux, Windows and macOS). Session restore has one too, run by hand because it needs an audio device: `node scripts/e2e/session.mjs app /abs/throwaway-profile [--ozone-platform=x11]` (plays, quits and relaunches the app, and checks it comes back on the same track and time, never saves 0:00 mid-restore, resumes on Play, and forgets a deleted album).

## Layout notes

- The protocol source of truth is `docs/PROTOCOL.md`. The Rust types are in `engine/crates/engine-sidecar/src/protocol.rs` and the TypeScript types in `app/src/shared/protocol.ts`. Change all three together.
- Window geometry and artwork positions live in `app/src/shared/layout.ts`. It is generated from `assets/ui/source` (see `assets/ui/MANIFEST.md`).
- Main-process settings (window bounds, closed side windows, last Open folder, `layoutVersion`, the last session) live in `settings.json` under userData (`app/src/main/settings.ts`). The cassette rack's album history (spines, sort mode, custom order) lives in its own `rack.json` under userData (`app/src/main/rackStore.ts`, pure logic in `rack.ts`). The renderer scales the fixed 767x616 composition to the window (`CassettePlayer.tsx`), so layout.ts coordinates stay in design px.
- The debug view opens with the URL hash `#debug` (`app/src/renderer/src/App.tsx`).
- Window rules (side windows, docking, shade, OS fixes) are in `docs/WINDOWS.md`. Read it before touching any window code.
- Plans and history are in `docs/plans/`.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- When graphify-out/graph.json exists, run `graphify query "<question>"` before your first grep, search or source-file read for a codebase question, and put this rule in every subagent prompt that explores code. Read raw files only for lines the graph or an earlier read already located. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. When the answer is under a Markdown heading, `graphify section "<heading>"` prints that section's text, so the .md need not be opened. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
- A committed graphify-out/graph.json is rewritten whole on every build, so a large diff to it in a pull request is expected. Do not flag it as churn or suggest skipping the graph rebuild or its hooks.
