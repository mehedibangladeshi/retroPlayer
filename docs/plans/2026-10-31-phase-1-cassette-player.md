# Plan: Phase 1 — minimal cassette player
Status: Executing (wave 4)

## Goal / Done when / Non-goals
Goal: build Phase 1 as specified in AGENTS.md (Rust sidecar engine + Electron/React cassette UI; import a file, play/pause/stop/back/forward).
Done when: the AGENTS.md "Done means" list holds.
Non-goals: everything in the AGENTS.md "Out of scope" list.

## Open questions
- [x] Q1 Assets: user added `cassette player/` (7 distinct PNG layers, reference jpeg). SVGs are duplicates (3 cassette SVGs identical; body base == top cover). → Build from PNG layers (user: "most efficient"). Move to `assets/ui/png/` + `assets/ui/reference/` with kebab-case names; list broken SVGs and missing button states in docs/ASSETS_TODO.md. Reels: one PNG holds both → render twice, clipped per reel, rotate about each hub. Buttons: one sheet → slices + CSS pressed/disabled.
- [x] Q1b Track name + elapsed/total time: on the cassette label (name on the light strip at the top of the cassette, time near "HIGH QUALITY AUDIO").
- [x] Q1c Window chrome: FRAMELESS now (deviates from AGENTS.md "standard OS frame is fine"; user chose). Drawn minimize/close work via IPC; player body is the drag region (buttons/cassette marked no-drag). Log in DECISIONS.md.
- [x] Q2 pnpm: installed by user → pnpm 12.16.1 at /usr/bin/pnpm, npm 12.2.1.
- [x] Q3 Commits: user request: run `/git-commit` for a baseline before execution starts, then `/git-commit` after each verified wave, staging untracked files too. No push. No AI attribution.
- [x] Q4 (orchestrator default) Root `package.json` + `pnpm-workspace.yaml` (package: `app`) so `pnpm dev|typecheck|lint` run from the repo root.
- [x] Q5 (orchestrator default) Protocol types hand-written in Rust (serde) and TS. Rust tests round-trip every example message in PROTOCOL.md. No codegen dependency.
- [x] Q6 (orchestrator default) `pnpm dev` = `cargo build -p engine-sidecar` then electron-vite dev; main spawns `engine/target/debug/engine-sidecar` (path overridable via env `RETRO_SIDECAR`). Packaging deferred.
- [x] Q7 (orchestrator default) Tiny committed WAV fixture (~0.25 s, 44.1 kHz, 16-bit mono sine), generated once with python stdlib `wave`.
- [x] Q8 (orchestrator default) Reel tape-amount animation (nice-to-have): optional, last task, dropped if layers don't allow it.

## Draft task split (pre-grill, rough; scores A/B/R)
W1: 1.1 docs/ scaffold (ARCHITECTURE, PROTOCOL, DECISIONS, ROADMAP, ASSETS_TODO) haiku 1/2/0 · 1.2 cargo workspace + player-core state machine & seek clamp + tests sonnet 1/1/1 · 1.3 electron-vite app scaffold + lint/typecheck haiku 0/2/0
W2: 2.1 player-core decode (symphonia) + DSP chain stub + WAV integration test sonnet 1/1/1 · 2.2 player-core output (cpal + rtrb + rubato), RT-safe callback sonnet 1/1/2 · 2.3 TS protocol types (app/src/shared) haiku 0/1/0
W3: 3.1 engine-sidecar NDJSON loop + Rust protocol types sonnet 1/2/1 · 3.2 main: spawn/supervise sidecar, file dialog, IPC; preload API sonnet 1/2/1
W4: 4.1 renderer debug UI + store from events + keyboard + DnD sonnet 1/2/1
W5: 5.1 cassette UI from assets (or placeholders) + reel animation sonnet 1/2/1 · 5.2 assets MANIFEST haiku
Final: full Verify-with suite + manual acceptance by user (FLAC/WAV/MP3 playback, renderer freeze test).

## Contracts

### C1 Protocol (NDJSON, one object per line, every message has `"v":1`, tag field `type`, camelCase keys)
Commands: `load{path}` · `play` · `pause` · `stop` · `seek{positionMs}` · `seekRelative{deltaMs}`
Events: `state{status,positionMs,durationMs|null,trackInfo|null}` · `position{positionMs}` (~20 Hz while playing) · `ended` · `error{code,message}`
status: `empty|stopped|playing|paused`. trackInfo: `{title,path,codec,sampleRate,channels}`.
error codes: `unsupported_format|file_not_found|no_output_device|decode_error|invalid_state|bad_message|internal|engine_crashed` (`engine_crashed` is emitted only by Electron main).
The engine emits `state` (empty) on startup and after every transition. Unknown/invalid lines → log to stderr + `error{bad_message}`, never exit.

### C2 TS types — `app/src/shared/protocol.ts` (owner 1.3)
```ts
export const PROTOCOL_VERSION = 1 as const
export type Status = 'empty'|'stopped'|'playing'|'paused'
export interface TrackInfo { title: string; path: string; codec: string; sampleRate: number; channels: number }
export type ErrorCode = 'unsupported_format'|'file_not_found'|'no_output_device'|'decode_error'|'invalid_state'|'bad_message'|'internal'|'engine_crashed'
type V = { v: typeof PROTOCOL_VERSION }
export type Command = V & ({type:'load';path:string}|{type:'play'}|{type:'pause'}|{type:'stop'}|{type:'seek';positionMs:number}|{type:'seekRelative';deltaMs:number})
export type EngineEvent = V & ({type:'state';status:Status;positionMs:number;durationMs:number|null;trackInfo:TrackInfo|null}|{type:'position';positionMs:number}|{type:'ended'}|{type:'error';code:ErrorCode;message:string})
export const SUPPORTED_EXTENSIONS = ['flac','wav','mp3','m4a','aac','ogg','oga'] as const
```

### C3 Preload API — `window.retro` (owner 3.3; type declared in `app/src/shared/api.ts`, owner 1.3)
```ts
export interface RetroApi {
  send(cmd: Command): void
  onEvent(cb: (e: EngineEvent) => void): () => void   // returns unsubscribe
  openFileDialog(): Promise<string | null>
  pathForFile(file: File): string                       // webUtils.getPathForFile
  minimizeWindow(): void
  closeWindow(): void
}
```
IPC channels: `engine:command` (send), `engine:event` (main→renderer), `dialog:open` (invoke), `window:minimize`, `window:close`.

### C4 player-core API (Rust; skeleton + stubs by 1.2, filled by later tasks)
```rust
// error.rs (1.2)
pub enum ErrorCode { UnsupportedFormat, FileNotFound, NoOutputDevice, DecodeError, InvalidState, Internal }
pub struct PlayerError { pub code: ErrorCode, pub message: String }
// state.rs (1.2) — pure, no I/O
pub enum Status { Empty, Stopped, Playing, Paused }
pub struct Transport { pub status: Status, pub position_ms: u64, pub duration_ms: Option<u64> }
impl Transport { new(); on_loaded(Option<u64>); play()->Result<(),PlayerError>; pause()->Result<..>; stop(); seek(u64)->u64; seek_relative(i64)->u64; on_ended() }
pub fn clamp_seek(target_ms: i64, duration_ms: Option<u64>) -> u64
// dsp.rs (1.2) — explicit, empty chain
pub trait DspStage: Send { fn process(&mut self, buf: &mut [f32], channels: u16, sample_rate: u32); }
pub struct DspChain { stages: Vec<Box<dyn DspStage>> }  // new(), process(); empty in Phase 1
// decode.rs (2.1)
pub struct Decoder; impl Decoder { open(&Path)->Result<Self,PlayerError>; track_info()->TrackInfo; duration_ms()->Option<u64>; sample_rate()->u32; channels()->u16;
  next_block(&mut self, out: &mut Vec<f32>)->Result<bool,PlayerError> /* interleaved f32; Ok(false)=EOF */; seek(&mut self, ms: u64)->Result<u64,PlayerError> }
// resample.rs (2.1)
pub struct Resampler; impl Resampler { new(in_rate,out_rate,channels)->Result<Self,PlayerError>; process(&mut self, input:&[f32], out:&mut Vec<f32>); flush(&mut self, out:&mut Vec<f32>) } // passthrough when rates equal
// output.rs (2.2)
pub struct OutputConfig { pub sample_rate: u32, pub channels: u16 }
pub struct Output; impl Output { open_default(capacity_frames: usize) -> Result<(Output, rtrb::Producer<f32>, OutputConfig), PlayerError>; set_playing(bool); clear() /*drop buffered audio on seek/stop*/; frames_played()->u64; reset_frames(u64) }
  // callback: reads ring only; silence when paused or underrun; no alloc/lock/log/block. Shared state via atomics.
// player.rs (3.1)
pub struct TrackInfo { pub title: String, pub path: PathBuf, pub codec: String, pub sample_rate: u32, pub channels: u16 }
pub struct Snapshot { pub status: Status, pub position_ms: u64, pub duration_ms: Option<u64>, pub track: Option<TrackInfo> }
pub enum PlayerEvent { State(Snapshot), Position { position_ms: u64 }, Ended, Error(PlayerError) }
pub struct Player; impl Player { new() -> (Player, std::sync::mpsc::Receiver<PlayerEvent>);
  load(&mut self,&Path)->Result<(),PlayerError>; play/pause/stop(&mut self)->Result<(),PlayerError>; seek(&mut self,u64); seek_relative(&mut self,i64); snapshot(&self)->Snapshot }
```
`TrackInfo` lives in player.rs but 1.2 creates it there (2.1 imports it). Stubs use `todo!()` bodies with `#[allow]` only where clippy needs it.

### C5 Layout — `app/src/shared/layout.ts` (owner 2.3)
Exports `WINDOW {width,height}` (CSS px, body crop at 1x), asset URLs are imported by the renderer via Vite alias `@assets` → `<repo>/assets/ui` (alias set by 1.3). Exports rects in CSS px for: each body layer (all full-window), `cassette` (x,y,w,h), `reels.left/right` {cx,cy,r}, `buttons.{pause,rewind,play,forward,stop}` rects (screen + slice source), `label.title` and `label.time` rects, `chrome.minimize/close` rects, `dragRegion` notes.

### File ownership
Root: `package.json`, `pnpm-workspace.yaml` → 1.3. `engine/**` → per C4 module owner. `app/src/main/**`, `app/src/preload/**` → 3.3. `app/src/renderer/**` → 4.1 then 5.1. `assets/ui/**`, `docs/ASSETS_TODO.md` → 2.3. Other `docs/*.md` → 1.1 then 5.2. `CLAUDE.md` → 5.2.

## Waves
| # | Task | Tier | A/B/R | Own | Depends | Acceptance |
|---|---|---|---|---|---|---|
| 1.1 | Docs: ARCHITECTURE, PROTOCOL (C1 with an example line per message), DECISIONS (seed: locked decisions, frameless, PNG layers, hand-written types, deps), ROADMAP | haiku | 0/2/0 | docs/{ARCHITECTURE,PROTOCOL,DECISIONS,ROADMAP}.md | — | every C1 message has a JSON example; DECISIONS lists each dep with reason |
| 1.2 | Cargo workspace; player-core skeleton (all C4 modules, stubs), state.rs + dsp.rs real, unit tests for state machine + seek clamp; sidecar stub main | sonnet | 1/2/1 | engine/** | — | `cargo test`, `cargo clippy --all-targets -- -D warnings` pass |
| 1.3 | Root pnpm workspace + app/ (electron-vite, React, TS strict, ESLint), `shared/protocol.ts` + `shared/api.ts` (C2/C3), `@assets` alias, frameless fixed window placeholder; scripts dev/typecheck/lint at root (`dev` runs cargo build first) | sonnet | 1/2/0 | package.json, pnpm-workspace.yaml, app/** (except later owners' dirs, which it creates as placeholders) | — | `pnpm install`, `pnpm typecheck`, `pnpm lint` pass |
| 2.1 | decode.rs (symphonia: flac,wav,mp3,aac/m4a/alac,ogg/vorbis) + resample.rs (rubato) + committed WAV fixture + integration test | sonnet | 1/1/1 | engine/crates/player-core/src/{decode,resample}.rs, …/tests/**, …/fixtures/** | 1.2 | fixture decodes with right rate/channels/duration; unit test resample length ratio; cargo test+clippy pass |
| 2.2 | output.rs (cpal default device, native rate, rtrb consumer, atomics, RT-safe callback) | sonnet | 1/1/2 | …/src/output.rs | 1.2 | no alloc/lock/log in callback (comment-justified); `no_output_device` mapped; cargo test+clippy pass |
| 2.3 | Assets: move `cassette player/` → `assets/ui/png/` + `reference/` (kebab names), crop transparent margins with a shared bbox, downscale to 2x of window size (magick/PIL), measure layout → `shared/layout.ts` (C5), MANIFEST.md, ASSETS_TODO.md | sonnet | 1/2/1 | assets/ui/**, `cassette player/` (removed), app/src/shared/layout.ts, docs/ASSETS_TODO.md | 1.3 | layers still stack pixel-aligned; layout.ts typechecks; MANIFEST lists every file + anchor |
| 3.1 | player.rs: decoder thread → DSP chain → resample → channel map → ring; commands; position events ~20 Hz from frames_played; ended → Stopped; errors as events | sonnet | 1/1/2 | …/src/player.rs | 2.1, 2.2 | state/seek semantics per AGENTS.md; cargo test+clippy pass |
| 3.2 | sidecar: protocol.rs (serde types for C1, round-trip tests for every PROTOCOL.md example), main.rs NDJSON stdin loop + event writer thread; stdio integration test (bad path → error, unknown msg ignored, startup state) | sonnet | 1/2/1 | engine/crates/engine-sidecar/** | 1.1, 1.2 | cargo test+clippy pass |
| 3.3 | Electron main (spawn `engine/target/debug/engine-sidecar` or `$RETRO_SIDECAR`, NDJSON framing, restart with backoff + `engine_crashed` event, file dialog filtered to C2 exts, window controls) + preload (C3) | sonnet | 1/2/1 | app/src/main/**, app/src/preload/** | 1.3 | contextIsolation on, nodeIntegration off; typecheck+lint pass |
| 4.1 | Renderer: engine store from events (+ position smoothing only), plain debug player view (5 buttons w/ disabled rules, Open, track name, time, error text), keyboard (Space, ←/→), drag-and-drop, seek hold (click ±10 s, hold repeats) | sonnet | 1/2/1 | app/src/renderer/** | 3.2, 3.3 | load → auto play; typecheck+lint pass; `pnpm dev` launches (verifier checks process starts) |
| 5.1 | Cassette UI: compose PNG layers per layout.ts, reels rotate only while playing (smooth stop, faster while seek held), sliced buttons with pressed/disabled CSS, title/time on label, working drawn min/close, drag/no-drag regions; debug view kept behind `?debug` | sonnet | 1/2/1 | app/src/renderer/** | 4.1, 2.3 | matches reference visually; same store as 4.1; typecheck+lint pass |
| 6.1 | Docs sync: ARCHITECTURE/DECISIONS/ROADMAP status, CLAUDE.md real commands incl. single-test commands | haiku | 0/2/0 | docs/{ARCHITECTURE,DECISIONS,ROADMAP}.md, CLAUDE.md | all | commands in CLAUDE.md run |

Wave 1: 1.1 · 1.2 · 1.3 — Wave 2: 2.1 · 2.2 · 2.3 — Wave 3: 3.1 · 3.2 · 3.3 — Wave 4: 4.1 — Wave 5: 5.1 — Wave 6: 6.1
Commit with `/git-commit` after each verified wave.

## Log
- MAP: none (empty repo, no code map)
- Toolchain: node v26.8.2, rustc/cargo 1.98.1, ALSA 1.2.16.1 present, pnpm MISSING
- Approved by user 2026-10-31 ("approved, go").
- Baseline: commit a28f223 (global git identity set per user: Mehedi Hasan <mehedipy@gmail.com>); `git status --porcelain` = clean.
- W1 launched: 1.1 haiku (docs) · 1.2 sonnet (engine skeleton) · 1.3 sonnet (app scaffold).
- Next: W2 briefs 2.1 decode/resample, 2.2 output, 2.3 assets/layout — drafted after W1 reports (need resolved crate versions + electron-vite config facts).
- 1.1 done (haiku): 4 docs, 10 JSON blocks ok. Gap to close in 6.1 (or 3.2 brief): PROTOCOL.md doesn't state pause on Empty/Stopped → invalid_state, stop/seek on Empty → no-op, play while Playing → no-op (per C4 Transport).
- 1.2 done (sonnet): 16 tests pass, clippy clean, sidecar builds. Versions: symphonia 0.6.1, cpal 0.18.2, rubato 5.0.1, rtrb 0.4.1, serde 1.0.229, serde_json 1.0.154. Deviation: ran `cargo search` (read-only, accepted). W2 briefs must tell agents to read crate APIs from ~/.cargo/registry/src (versions newer than training data).
- 1.3 done (sonnet): install/typecheck/lint/build pass. electron 45.2.1, electron-vite 6.0.0, vite 8.3.5, react 19.3.1, TS ~6.0.3, eslint 10.14.0. app is "type":"module" → preload emitted as index.mjs.
  ⚠ ESM preload is not supported with sandbox: true → 3.3 must emit preload as CJS (give 3.3 ownership of app/electron.vite.config.ts).
- W1 verify launched: verifier (haiku) + reviewer (sonnet: 1.2, 1.3).
- W1 review: 1.2 no findings. 1.3: BLOCKER ESM preload + sandbox → assigned to 3.3 (owns app/electron.vite.config.ts: preload output cjs `[name].js`, main points to ../preload/index.js); minor CSP blocks Vite dev preamble/HMR → assigned to 4.1 (owns renderer/index.html; dev-only CSP relax); minor `*.tsbuildinfo` not ignored → VERIFY fix 1.3 (1 line, .gitignore).
- W1 verified (verifier haiku: all checks pass, OUTSIDE-OWN none). Committed f71b708 via /git-commit (user yes).
- W2 baseline: clean at f71b708. Launched 2.1 sonnet (decode/resample) · 2.2 sonnet (output; contract + `has_failed()`) · 2.3 sonnet (assets/layout; allowed git mv, magick, python3 -I).
- Contract C4 addition: Output::has_failed(&self)->bool (device error flag from cpal error callback).
- 2.2 done (sonnet): 22 tests pass, clippy clean. Output is Send on Linux (compile-time test). Formats f32/i16/u16. Fatal-only `failed`.
  ⚠ clear() race: samples pushed after clear() but before the callback's next run are also dropped → 3.1 gets output.rs in Own to add a clear-ack (e.g. `clear_pending()` or a generation counter) and must wait for it before refilling.
- 2.2 review (sonnet): BLOCKER clear race (confirmed) + minors (more sample formats, error mapping → NoOutputDevice). RT safety: no findings. → Retry 2.2 #1 (sonnet, same agent resumed): clear_gen/clear_ack + `clear_pending()`; C4 addition: Output::clear_pending(&self)->bool. 3.1 then no longer needs output.rs in Own.
- 2.2 retry #1 done: clear_gen/ack + clear_pending(), 10 sample formats, all cpal errors → NoOutputDevice; lib 26 tests pass, clippy clean. (decode_wav seek test failing = 2.1 in progress.)
- 2.1 done (sonnet): 26 unit + 5 integration pass, clippy clean. rubato Fft FixedSync::Input chunk 1024. Seek lands on packet boundary ≤ target (WAV: 100→78 ms); test relaxed accordingly — accepted (player must use the returned position). Codec = symphonia short_name lowercased.
- 2.1 review: no blockers. Minors sent back to 2.1 agent (follow-up): Resampler::reset() + has_failed(); clamp unknown-duration seek; format-level ResetRequired. C4 additions: Resampler::reset(&mut self), Resampler::has_failed(&self)->bool.
- 2.1 follow-up done: reset(), has_failed(), 24h seek clamp, format-level ResetRequired → recreate. 27 unit + 5 integration pass, clippy clean.
- 2.3 done (sonnet): WINDOW 767x616, 7 PNGs @2x, paint order bodyBase, cassetteBase, cassetteMid, cassetteReel, bodyTopCover, bodyBottom, bodyButtons. Reels L(263.5,249,r36) R(512.5,249.5,r36). Button labels live in body-bottom; chrome/brand/HQA in top-cover. No tape layer. Orchestrator removed leftover empty dir "cassette player/" (rmdir, no file content).
- W2 verifier (haiku): all checks pass, OUTSIDE-OWN none; PNG sizes 2x, even, body-* identical. Awaiting 2.3 review.
- 2.3 review: no blockers; 3 minors → VERIFY fix 2.3 (3 lines): layout.ts REELS comment (clip radius), MANIFEST reel centres, ASSETS_TODO reel workaround wording. typecheck re-run.
- W2 committed 35d0366 (user yes). W3 baseline: clean at 35d0366.
- W3 launched: 3.1 sonnet (Player; may add OutputHandle to output.rs additively; Output opened lazily on first load) · 3.2 sonnet (sidecar; stdio test accepts no_output_device) · 3.3 sonnet (main/preload + electron.vite.config.ts preload → CJS).
- 3.3 done (sonnet): typecheck/lint/build pass; preload → out/preload/index.cjs (CJS). Not runtime-tested yet.
- 3.3 security read by orchestrator (preload + main/index.ts): contextIsolation/sandbox on, only `retro` API exposed, event object not leaked, all IPC sender-checked to main frame, window.open denied, navigation blocked, commands validated. OK. Note: `load` accepts any path from the renderer (by design: dialog/DnD paths); engine only decodes audio.
- 3.1 done (sonnet): 33 unit + 5 decode + 2 player tests pass, clippy clean. Worker thread per Output; OutputHandle added (player_core::output::OutputHandle); ring fixed 24000 frames; play after Ended rewinds; seek decode failure → Error event. Review launched.
- 3.2 done (sonnet): 5 unit + 5 stdio tests pass, clippy clean; all PROTOCOL.md examples round-trip. W3 verifier + 3.2 reviewer launched.
- 3.2 review: BLOCKERS (non-UTF-8 line exits sidecar; float positionMs/deltaMs rejected) → Retry 3.2 #1 (same agent): read_until + lossy, lenient rounding, 1 MiB line cap, catch_unwind.
- 3.3 cross-check: TS sends unrounded floats → VERIFY fix 3.3 (3 lines, sidecar.ts send(): Math.round, seek ≥ 0). typecheck+lint re-run.
- 3.1 review: no blockers; minors → follow-up (same agent): play/ended race, seek after Ended, ring 96000 frames, #[ignore] device tests for acceptance behaviours.
- W3 verifier: all checks pass, OUTSIDE-OWN none; smoke: Electron + dev server launch, no errors, no orphan processes; engine startup not confirmed by the 30-line tail → re-verify after retries with engine-start evidence.
- 3.1 follow-up done: play() race fixed under one lock, seek clears needs_rewind, ring 96_000; 4 #[ignore] device tests pass on this machine (`-- --ignored`), normal suite + clippy pass.
- 3.2 retry #1 done: raw reader (1 MiB cap, invalid UTF-8 → bad_message), lenient rounding (half away from zero, negative seek → 0), catch_unwind recreates Player. 9 unit + 7 stdio pass, clippy clean.
- For 6.1: PROTOCOL.md must add rounding rule ("positionMs/deltaMs accept any JSON number; rounded half away from zero; negative positionMs → 0") + the Empty/pause/stop/seek rules logged under 1.1.
- W3 re-verify launched (with engine-start evidence).
- W3 re-verified: workspace tests + 4 device tests + clippy + typecheck/lint/build pass; engine smoke (load fixture → state stopped 250 ms, pcm_s16le); pnpm dev spawns engine-sidecar alongside Electron; no leftovers.
- W3 committed 51b9f79 (user yes). W4 baseline clean at 51b9f79. Launched 4.1 sonnet (renderer store/input/debug view; also owns app/electron.vite.config.ts for dev-only CSP plugin).
- 4.1 done (sonnet): typecheck/lint/build pass; prod CSP has no script unsafe-inline; dev smoke clean. UI interaction not runtime-tested → W4 verify uses a CDP-driven e2e smoke (sonnet verifier, justified: cross-process e2e) + reviewer.
  API for 5.1: useEngine(), useDisplayPosition(), useSeekHold() {held,start,stop,bind(dir)}, useKeyboard(seek), useFileDrop(), engine/commands.ts, input/openFile.ts, format.ts.
- 4.1 review: no blockers; minors (hold keeps firing after stop/ended, stale animated frame, cross-key keyup stops other hold, no-extension message, store start() at import, modifier keys). Bundle into a 4.1 follow-up together with any e2e findings.
- W4 e2e (CDP, built app + real engine): a–k PASS incl. renderer-freeze acceptance (+3.3 s during 3 s freeze), pause holds, ±10 s seeks, stop→0, file_not_found readable, close exits, no leftovers. g "weak pass" explained by review minor #1 (hold kept seeking after ended) → confirmed bug.
- 4.1 follow-up sent (same agent): hold stops on leaving playing/paused, keyup direction match, ignore modifiers, smoothing reset, explicit store start + preload guard, drop messages.
- e2e harness kept at scratchpad/w4e2e/e2e.mjs for reuse in W5/final verify.
- 4.1 follow-up done: hold ends on status change; keyup direction/source match; modifiers ignored; smoothing keyed on lastPositionAt; explicit start() in main.tsx + preload guard; drop messages. Hook API backward compatible. Re-verify (haiku) with e2e + hold_end check launched.
- W4 re-verified: static pass; e2e all PASS; hold_end PASS (ended → stopped 0, no further seeks); no leftovers, clean logs.
