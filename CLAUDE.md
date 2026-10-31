# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

The full project spec, locked architectural decisions and working rules are in AGENTS.md, imported below. Follow it. Where it says "ask me" or "stop and tell me", ask the user before deviating.

@AGENTS.md

## Current state
The repo is not scaffolded yet (Phase 1 has not started). The commands below are the target workflow from the spec. They will not work until the scaffold exists. Update this section with the real commands, including how to run a single test, once they do.

- `pnpm dev` (in `app/`): start Electron and build and launch the sidecar
- `pnpm typecheck`, `pnpm lint`
- `cargo test`, `cargo clippy -- -D warnings` (in `engine/`)
