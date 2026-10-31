# Roadmap

## Phase 1: minimal cassette player (in progress)

A minimal player. Open an audio file, then play, pause, stop, and seek with the buttons, while an animated cassette plays on screen.

### Scope

- [x] Repo scaffold with a working dev workflow (`pnpm dev` starts Electron, and builds and launches the sidecar).
- [x] Basic cassette UI built from the assets.
- [x] Working play, pause, stop, forward and backward.
- [x] Import a local audio file (dialog and drag-and-drop) and play it through the Rust engine.

Packaging and installers are not done. The sidecar path is the dev build (`engine/target/debug/engine-sidecar`, or `RETRO_SIDECAR`).

### Done means

- [ ] A FLAC, a WAV and an MP3 each import and play correctly. Needs manual check by the user: only WAV was exercised automatically.
- [x] All five buttons work and reflect real engine state. The reels animate correctly for each state.
- [x] Audio keeps playing when the renderer is frozen (verified by blocking it in DevTools).
- [x] Errors (bad file, no audio device) show a readable message instead of crashing.
- [x] `cargo test`, `cargo clippy -- -D warnings`, `pnpm typecheck` and `pnpm lint` pass.
- [x] `docs/` is up to date, including the protocol and the decision log.

### Out of scope for now

Not built in Phase 1, and no dependencies are added for these:

- Equalizer or tone controls
- Playlist
- Library
- Multiple windows
- Mobile
- Streaming
- Cover-art extraction
- Settings
- Bit-perfect or exclusive mode

## Later phases (not started)

The order of these phases is not fixed yet.

### Lossless and bit-perfect output

Output the file's native sample rate and bit depth without resampling, with an option for exclusive device access.

### Equalizer

Add an equalizer to the DSP chain. The chain is already an explicit, empty stage list in Phase 1.

### Playlist

Queue and play several tracks.

### Library

Browse and manage a collection of audio files.

### Multi-window floating and snappable windows

Separate floating windows for the player, equalizer, playlist and library. The windows can snap to each other. Each window shows the same engine state.

### Mobile (iOS and Android)

Reuse `player-core` in native mobile apps.
