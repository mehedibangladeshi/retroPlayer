# Plan: Power deck controls
Status: Complete

## Goal / Done when / Non-goals
Goal: make the power deck window's controls work (volume knob, seek bar, visualizer, Loop Song, Shuffle, Import Album, Power, VU meter).
Done when: TBD in lock.
Non-goals: TBD.

## Open questions
- [x] Power button = quit the app (session already saved on quit)
- [x] Volume, Loop Song, Shuffle: engine-owned, saved in settings.json by main, re-sent at startup
- [x] Visualizer: spectrum bars and oscilloscope, click switches; engine computes, ~30 Hz
- [x] Missing art: code-drawn visuals (clipped rotating knob disc, CSS lamps, needle, seek fill); ASSETS_TODO updated
- [x] Power window may already send commands (index.ts fromAppWindow covers satellites)
- [x] (default) Volume applies to the whole output incl. key sounds; knob 0..10, gain −40 dB..0 dB, 0 = mute
- [x] (default) Shuffle = engine shuffled play order; Next/Previous move to the engine and walk that order

## Contracts
Protocol (v1, additive):
- cmd `setVolume {volume:number}` (engine clamps 0..1) · `setLoop {on:boolean}` · `setShuffle {on:boolean}` · `next` · `previous`
- evt `options {volume:number, loop:boolean, shuffle:boolean}`: once at engine start and after every set*.
- evt `levels {rms:number, peak:number, bands:number[16], wave:number[64]}`: rms/peak/bands 0..1, wave -1..1; sent with each position tick while playing. Renderer decays to 0 when none for 150 ms.
- next: next in play order, nothing at the end. previous: previous in order, restart (seek 0) on the first. Both play like playIndex.
- Loop Song: on ended, replay the same track. Manual next/previous unaffected.
- Shuffle on: order = current track first, then the rest shuffled (xorshift seeded from time, no crate). Off: album order. loadAlbum with shuffle on reshuffles from the chosen index.
player-core:
- `pub fn gain_for(volume: f32) -> f32`: 0 → 0, else 10^(2*(v-1)) (−40..0 dB). Applied after the key-sound mixer (whole output), via an AtomicU32 in Shared.
- `levels.rs`: `pub struct Levels {rms, peak, bands:[f32;16], wave:[f32;64]}`, `pub fn analyze(mono:&[f32], sample_rate:u32) -> Levels` (hand-written radix-2 FFT, 1024 frames, 16 log bands 40 Hz–16 kHz, dB-scaled to 0..1).
- Callback pushes post-gain samples into an rtrb tap (drop when full, no alloc/lock); an analysis thread keeps the latest Levels; `Player::set_volume(f32)`, `Player::levels() -> Option<Levels>`.
Main: settings `options?: {volume, loop, shuffle}`; saved on each `options` event; sent as setVolume/setLoop/setShuffle at startup and after a sidecar restart. RetroApi `quit()` → app.quit().
Renderer: commands setVolume/setLoop/setShuffle/next/previous; store keeps `options`; `useLevels()` subscribes to `levels` outside the store. Pure math in `views/powerMath.ts`.
Keyboard (player + power windows): Up/Down volume ±0.05, L loop, S shuffle, V visualizer mode (power only). Existing Space/Left/Right unchanged.
Knob: 270° sweep, 0 at 225° start; baked pointer = 8.33, so rotation = v*270 − 225 deg.

## Waves
See preview in chat; tasks 1.1–6.2.

## Log
- MAP: none
- Baseline git status: dirty (power deck window work uncommitted; see session start)
- Approved 2026-11-14 ("must be TDD. go ahead."). Status → Executing.
- Baseline: git status dirty (16 M, untracked power/rack work); snapshot of app/src, app/test, docs, engine/crates, MANIFEST in scratchpad/baseline for diff -ru.
- W1 launched: 1.1 haiku (docs/PROTOCOL.md), 1.2 sonnet (levels.rs), 1.3 sonnet (album.rs Playlist order).
- Next: 2.3 sonnet (layout POWER rects + powerMath.ts) can start when a slot frees; 2.1 opus after 1.2; 2.2 haiku after 1.1.
- 1.1 done (haiku). Note: a Rust round-trip test parses PROTOCOL.md JSON examples, so `cargo test` stays red until 3.1 adds protocol.rs types. Expected; 3.1 owns it.
- 2.2 launched (haiku): protocol.ts, ndjson.ts, ndjson.test.ts.
- 1.2 sonnet done; 1.3 sonnet done; 2.2 haiku done (131 tests pass). W1 verifier: OUTSIDE-OWN none, levels/album/clippy pass. Reviewer 1.2/1.3: no blockers (minors: 48k-only tests, empty-album shuffle flag, seed|1). Accepted.
- Note for 3.1: Playlist shuffle flag lives in `order`; a new Playlist (loadAlbum) starts unshuffled, so the sidecar must keep its own shuffle bool and call reshuffle_from(index, seed) after loadAlbum. Seed from time nanos.
- 2.3 sonnet launched (layout POWER + powerMath). 3.2 sonnet launched (main options persistence + quit).
- 2.1 opus done: callback output.rs:399-407 + post :466-484 reviewed by orchestrator line by line: RT-safe (atomic load, in-place math, non-blocking rtrb push). --ignored device tests pass.
- 3.2 sonnet done (143 JS tests). Options re-sent on the fresh engine's first `options` event (index.ts ~76-80); quit IPC index.ts ~722.
- 3.1 opus launched (sidecar). Reviewer launched for 2.1 + 3.2. 3.3 waits for 2.3 (needs powerMath.stepVolume).
- Review 2.1/3.2: no blockers. 3.2 minor (intermediate echo saved default loop/shuffle) sent back to builder: fixed with a skip count (143 pass). TDD gap: the follow-up's new test was not run red against the old code (builder admitted). Report to user.
- 2.3 sonnet done: KNOB {cx229,cy206.75,r104}; baked pointer ~4 px below centre (slight wobble when rotated, art issue → ASSETS_TODO). METER pivot (392,871), needle 41, −180..−90 deg. decay fallPerMs 0.002.
- 3.3 sonnet launched (renderer commands/store/useLevels/keys). Verifier launched for 2.1/2.2/2.3/3.2.
- Next: 4.1 + 4.2 after 3.3.
- 3.3 sonnet done (148 pass). useKeyboard mounted in CassettePlayer + DebugPlayer; PowerView mount is 5.1.
- 3.1 opus done: cargo workspace green, clippy clean, --ignored 3/3 on device (loop replay, levels). Startup order now state then options. previous on first reloads+plays.
- W2 verifier pass for 2.1/2.2/2.3/3.2. 4.1, 4.2 sonnet launched; reviewer for 3.1/3.3 launched.
- 4.1 sonnet done (knob/seek; no new tests, math covered by powerMath). Mount: <PowerKnob scale/> <PowerSeek scale/>.
- Review 3.1/3.3: no blockers. Minor fixed via task 3.4 (haiku, skip.ts backAction: index 0 no longer forces restart under shuffle). Other minors accepted (levels lock at 20 Hz on main thread; l/s no preventDefault).
- 3.4 haiku done (backAction; red→green, 150 pass). 4.2 sonnet done (visualizer/meter; smoothing.ts tested; face #b1ad9f).
- 5.1 sonnet launched (PowerView integration). Reviewer for 4.1/4.2 launched.
- Review 4.1/4.2: no blockers; knob flick-back + lost wheel steps sent back to 4.1 builder (knobValue.ts, TDD).
- 5.1 sonnet done: 152 pass, build ok. useKeyboard mounted in PowerView via useSeekHold. 6.1 haiku docs launched. 6.2 live check waits for the knob fix.
- 4.1 follow-up done (knobValue.ts, red→green, 156 pass). 6.1 haiku docs done (DECISIONS +4, ARCHITECTURE, ASSETS_TODO 21; MANIFEST unchanged).
- 6.2 live CDP check (sonnet) and final full-suite verifier (haiku) launched.
- Final suite: typecheck/lint ok, 156 JS pass, cargo 113 pass (9 device-ignored), clippy clean, nothing outside allowed files.
- 6.2 live CDP: 8/8 checks pass (options/lamps, keys, knob drag+wheel, seek, levels ~19/s + decay on pause, next/prev, Power quits + options persist across relaunch, screenshots).
- Complete. Actual mix: 4 haiku (1.1, 2.2, 3.4, 6.1) · 9 sonnet (1.2, 1.3, 2.3, 3.2, 3.3, 4.1, 4.2, 5.1, 6.2) · 2 opus (2.1, 3.1). Follow-ups sent back: 3.2 echo save, 4.1 knob pending value, 3.4 backAction (all TDD; 3.2 follow-up red not shown). No escalations. Nothing committed.
