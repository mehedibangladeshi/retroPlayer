# Plan: Album track names, a real rotary volume knob, engine volume boost
Status: Complete

## Goal / Done when / Non-goals
Goal:
1. In the playlist, an album's track rows drop the artist ("01. Title"). A single track or a mixtape track keeps "Artist – Title".
2. The volume knob turns by grabbing and rotating it around its centre, not by dragging up and down.
3. Research volume boost past 100% (done: docs/research/2026-11-14-volume-boost.md) and build it: 0/+3/+6/+9/+12 dB with a look-ahead limiter in the engine, set from the right-click menu and a BOOST lamp on the power deck.

## Open questions
- [x] Mixtape = a folder whose tracks don't all share one artist; then every row shows "Artist – Title". Otherwise rows show "01. Title". This applies to the playlist and the rack preview (both use TrackRows). Single files have no rows, so nothing changes for them.
- Research done: docs/research/2026-11-14-volume-boost.md. Recommendation: a separate boost in dB (0..+12, default 0, bypassed at 0 so output stays bit-identical), a hand-rolled look-ahead peak limiter DspStage (-1 dBFS), a `setBoost {boostDb}` command and `boostDb` in `options`. Unverified: whether DspChain runs on the decoder thread.
- [x] Knob: relative turn. The angle travelled around the centre turns the knob, with no jump on grab, clamped at 0 and 10 (no wrap). A click without moving still points it. Wheel and keys stay the same.
- [x] Boost UI: a right-click menu "Volume boost" submenu with radio items Off/+3/+6/+9/+12 dB, saved in settings.json options. PLUS (user): a BOOST lamp on the power deck near the volume knob, in the other indicators' style, that can also adjust the boost.
- [x] Lamp: green LED + code-drawn 'BOOST' label with the level under it (OFF, +3 dB … +12 dB). A click steps Off→+3→+6→+9→+12→Off; the wheel steps up/down (clamped). Lit while boost > 0. Lower-right corner of the deck past the '10' mark, outside the knob hit circle (r 140). Label is a placeholder → ASSETS_TODO.md.
- Design (orchestrator): boost and limiter go in the cpal callback `post()` (output.rs), NOT in DspChain. Reasons: the DspChain is before the 2 s ring (a change would be heard ~2 s late) and before the resampler (resample overshoot would pass the limiter). The callback rules still hold: preallocated delay line, atomics only. Only music is boosted; key sounds are not. At 0 dB: samples pass bit-identical (bypass).
- (scout notes) Scout: no such term or type in code. Only TrackRows (playlist and rack preview) calls trackRowName. A single file has album=null, so the playlist shows "No album loaded" and there are no rows. Album.artist falls back to the first track's artist when the album-artist tag is missing (album.rs:253).
- (scout notes) Knob today: a drag is vertical (dragVolume, 200 px for the full range), a click points the knob (angleVolume), plus wheel and keys. Range 0..1 → gain_for, a dB curve from -40 dB to 0 dB clamped at 1 (output.rs:129). Gain is applied in the output callback post(); there is no limiter.
- [x] Boost: research, then build in this run.

## Contracts
MAP: none

- Names (1.1), app/src/renderer/src/views/trackRowName.ts:
  `mixedArtists(album: Album): boolean`: true when the tracks' effective artists (`t.artist ?? album.artist`, nulls ignored) hold more than one distinct value.
  `trackRowName(track, i, showArtist: boolean, albumArtist: string | null)`: `01. Artist – Title` when showArtist and an artist is known, else `01. Title`.
  TrackRows passes `mixedArtists(album)`.
- Knob (1.2), views/powerMath.ts:
  `pointerAngle(dx, dy): number | null`: degrees, atan2(dx, -dy) (0 = up, clockwise positive), null within 8 design px of the centre.
  `turnVolume(v, prevDeg, deg): number` = clamp01(v + d/KNOB_SWEEP), where d = deg - prevDeg wrapped into (-180, 180].
  The drag applies it per pointermove, so the stops hold at 0 and 1 with no wrap. `dragVolume` is removed. Click-to-point (`angleVolume`), wheel and keys are unchanged.
- Limiter (2.1), engine/crates/player-core/src/limiter.rs:
  `pub struct Limiter`; `Limiter::new(channels: usize, sample_rate: u32) -> Self` allocates everything.
  `fn process(&mut self, buf: &mut [f32], boost_db: f32)`: interleaved, in place, no allocation.
  `fn reset(&mut self)`.
  Constants: look-ahead 1.5 ms, release 80 ms, ceiling -1 dBFS (sample peak), boost-gain ramp 20 ms.
  boost_db is clamped to [0, 12]. At 0 dB with the ramp settled, the output equals the input delayed by the look-ahead, bit for bit (no gain reduction).
- Output and player (2.2):
  `Shared.boost: AtomicU32` (f32 dB bits); `Output::set_boost_db(db)`.
  The callback owns a `Limiter` built at open (device channels and rate). It runs on the music samples BEFORE the key-sound mix and BEFORE the knob gain. It is reset when the output buffer is cleared (seek/load/stop).
  `Player::set_boost_db(&self, db: f32)` clamps to [0, 12] (NaN → 0); `Player::boost_db(&self) -> f32`. It is re-applied when the output opens.
- Protocol (2.3, 3.1):
  Command `setBoost {boostDb: number}`. Rust: `SetBoost { boost_db: f64 }` serde camelCase.
  The `options` event gains `boostDb: number`. The sidecar answers setBoost with an options echo and re-applies it after a Player rebuild.
  Main validation: a finite number.
- Shared app (3.1): `app/src/shared/boost.ts`: `BOOST_STEPS = [0, 3, 6, 9, 12]`, `nextBoost(db)` (cycles, unknown → 0), `stepBoost(db, dir: 1 | -1)` (clamped), `boostLabel(db)` ('OFF' | '+6 dB').
  `Options.boostDb` (default 0 for old settings.json); optionsCommands adds setBoost.
  contextMenu gains `boost: { db: number; set(db: number): void }` → a "Volume boost" radio submenu.
  Renderer `setBoost(db)` lives in engine/commands.ts.
- Lamp (3.2): PowerView only. Its positions are constants in PowerView, not layout.ts (that file is generated). Code-drawn text uses Liberation Sans (appFont test).

## Waves
| # | Task | Tier | Files owned | Depends on | Acceptance |
|---|------|------|-------------|------------|------------|
| 1.1 | Album rows drop the artist unless mixed | haiku | views/trackRowName.ts, views/TrackRows.tsx, test/trackRows.test.ts | — | tests red→green: same-artist album → "01. Title"; mixed → "01. A – T"; pnpm test |
| 1.2 | Knob relative turn | sonnet | views/powerMath.ts, power/PowerKnob.tsx, test/powerMath.test.ts | — | pointerAngle/turnVolume tests (wrap at ±180, stop at 0/1); dragVolume gone; pnpm test, typecheck, lint |
| 2.1 | Look-ahead limiter stage | opus | player-core/src/limiter.rs, player-core/src/lib.rs | — | unit tests: 0 dB bit-identical delayed; +12 dB full-scale never > ceiling; +6 dB quiet ≈ 2×; reset; cargo test + clippy |
| 2.2 | Boost in the output callback + Player API | opus | player-core/src/output.rs, player-core/src/player.rs, player-core/tests/player.rs | 2.1 | post() test: boost lifts music, not key sounds; set_boost_db clamp test; cargo test + clippy |
| 3.1 | App protocol, options, menu, command | sonnet | shared/protocol.ts, shared/boost.ts, main/ndjson.ts, main/options.ts, main/contextMenu.ts, main/index.ts, renderer engine/commands.ts, test/{boost,options,contextMenu,ndjson}.test.ts | — | boost/options/menu tests red→green; old settings → boostDb 0; pnpm test/typecheck/lint |
| 2.3 | Sidecar setBoost + PROTOCOL.md | haiku | engine-sidecar/src/{protocol.rs,main.rs}, engine-sidecar/tests/stdio.rs, docs/PROTOCOL.md | 2.2 | stdio test: setBoost 6 → options boostDb 6; 99 → 12; "x" → bad_message; cargo test + clippy |
| 3.2 | BOOST lamp on the power deck | sonnet | views/PowerView.tsx, views/PowerView.css, test/appFont.test.ts (if needed) | 3.1 | click cycles, wheel steps, lamp lit when > 0, aria label; pnpm test/typecheck/lint |
| 4.1 | Docs | haiku | docs/DECISIONS.md, CONTEXT.md, docs/ARCHITECTURE.md, docs/TESTING.md, docs/ASSETS_TODO.md, docs/ROADMAP.md | 1.2, 2.3, 3.2 | decisions (mixtape rule, relative knob, boost in callback); terms Mixtape, Boost; lamp placeholder |
| 4.2 | Live CDP check | sonnet | scratchpad only | all | built app: album rows, knob turn, lamp cycle + options echo, levels rise with boost, screenshot |

## Log
- 2026-11-14 Grilling started. MAP: none (no code map in the repo).
- Approved ("use opus agents where needed. go ahead"). 2.1 and 2.2 (real-time audio) raised to opus. Baseline porcelain: ?? assets/ui/all basic cassette/ · ?? assets/ui/source/album cover deck/ · ?? assets/ui/updated send 9-11-26/ · ?? docs/plans/2026-11-14-trackname-knob-boost.md · ?? docs/research/
- Wave 1 launched: 1.1 haiku, 1.2 sonnet, 2.1 opus.
- 1.1 haiku done: mixedArtists + new trackRowName signature, tests red→green. Its pnpm test failure was powerMath.test (1.2 mid-TDD). Wave 2 task 3.1 sonnet launched (no deps).
- 1.2 sonnet done: pointerAngle/turnVolume, incremental drag, dragVolume removed; tests red→green; 260 pass. Reviewer (sonnet) for 1.1+1.2 launched.
- Review 1.1+1.2: no blockers. Accepted minors: a grab in the 8 px centre dead zone needs one extra move before turning; a wheel or key step during a drag isn't re-synced into the drag.
- 2.1 opus done: Limiter (72-frame look-ahead at 48k, min-ring + averaged envelope, O(L) scans, no alloc), 6 tests red→green. Deviation (accepted): an empty buffer doesn't consume the post-reset jump. Launched 2.2 opus + reviewer of 2.1 (sonnet, line by line for real-time safety).
- 3.1 sonnet done: boost.ts, protocol, ndjson, options (skip 4), menu radio submenu, index wiring, setBoost, store; tests red→green. VERIFY fix 3.1 (3 lines): app/test/engineStore.test.ts expects boostDb (outside 3.1's Own); 2/2 pass. Launched 3.2 sonnet (lamp).
- 2.1 review: one defect: the release stalls about 1e-4 below 1.0 after limiting, so g<1 multiplies forever and 0 dB is no longer bit-exact (breaks the contract). Minors: partial frame, weak reset/ramp tests, perf OK. Launched 2.1-fix sonnet (test-first).
- 3.2 sonnet done: BOOST LED (397,337) r3 + text, button {366,328,62x40}; 267 pass. Not checked live. Reviewer for 3.1+3.2 (sonnet) launched.
- Review 3.1+3.2: no blockers. Accepted minors: an old engine without boostDb would show '+undefined' (the new engine always echoes it); an off-list hand-edited value leaves no radio checked; wheel bursts step slower than the wheel turns.
- 2.1-fix sonnet done: release snaps at 1e-3, so 0 dB is bit-exact after limiting (new test at 48k and 192k, red→green); stronger reset test; debug_assert on whole frames. 8 limiter tests.
- 2.2 opus done: Music{consumer, Limiter, 8192-frame scratch} in the callback; boost before key sounds and knob; reset on clear; Player set_boost_db/boost_db re-applied on open; workspace tests + clippy pass. Note: frames_played runs 1.5 ms ahead (accepted). Launched 2.3 haiku + reviewer of 2.2 (sonnet).
- Review 2.2: no blockers. Accepted minors: the last 1.5 ms of the final track stays in the delay line (inaudible); position runs 1.5 ms ahead; no test for underrun or pause with boost on.
- 4.1 haiku done: DECISIONS (3 entries), CONTEXT (Mixtape, Boost), ARCHITECTURE, TESTING, ASSETS_TODO #22, ROADMAP. Spot-checked, OK.
- 2.3 haiku done: SetBoost, options boostDb, rebuild re-apply, stdio test, PROTOCOL.md (examples use 6.0 for the round-trip test); tests red→green. Final: verifier (haiku) + 4.2 live CDP (sonnet) launched.
- Final verifier: typecheck, lint, 267 JS tests, cargo test, clippy, build all pass; OUTSIDE-OWN none; 33 files +525/-149.
- 4.2 live CDP: all PASS. Rows 'Song 1' vs 'Artist 1 – Tune 1'; a 60° arc moved volume 3.0→5.2 (expected +2.22); a click points the knob; a 330° arc stops at 10; the lamp cycles OFF→+12→OFF, the wheel steps, +6 dB survives a relaunch; meter RMS 0.00133 → 0.00527 at +12 dB (≈4×). Screenshot shows the lamp lower right of '10'.
- Close: tier mix 2 haiku + 3 sonnet + 2 opus builders (+1 sonnet limiter fix, 1 haiku docs); 4 sonnet reviewers, 1 haiku verifier, 1 sonnet live check; no escalations; 1 VERIFY fix (3.1, engineStore test, 3 lines).
