# Research: letting quiet tracks play loud (volume boost past 100%)

Date: 2026-11-14. Read-only research; no code changed.

## Summary

1. VLC's "above 100%" is a plain float multiply (`*= factor`, max 200%) with no limiter; clipping happens later at device conversion. Its separate "volume normalizer" is a crude buffer-RMS divider. mpv is also a plain multiply (max 130% default, cubic knob curve).
2. foobar2000 and mpv handle loudness with ReplayGain tags plus a peak-based "don't amplify past clipping" rule, not a limiter.
3. The smallest design that sounds clean is boost gain (up to about +12 dB) followed by a fixed look-ahead peak limiter, as a `DspStage` at the very end of the chain. About 60 lines of Rust, no crates, real-time safe.
4. Bit-perfect is untouched when boost is 0 dB and the limiter stage is bypassed (do not even run it). ReplayGain and R128 analysis are phase 2 and need a pre-scan or tags.
5. Product decision needed: how loud, how "automatic", and whether a limiter's sound is acceptable on a "lossless" player (see Open questions).

## Current engine (read-only inspection)

- `dsp.rs`: `DspChain` of `Box<dyn DspStage>` (`process(&mut [f32], channels, sample_rate)`), currently empty.
- `output.rs`: `gain_for(v)` = 0 for v<=0, else `10^(2(v-1))` (-40 dB..0 dB, knob 0..1). Applied in the cpal callback via an `AtomicU32` (`post()`), multiplying each sample, with the post-gain mono signal tapped for the level meter.
- `player.rs`: `set_volume` clamps to [0,1]. `docs/PROTOCOL.md` `setVolume {volume 0..1}` and the `options` event carry it.
- So today the max is exactly unity (0 dB) and the DSP chain is not on the audio-callback path as far as `post()` shows; where `DspChain` runs (decoder thread vs callback) must be confirmed before adding a stateful limiter. A limiter in the decoder thread is allocation-safe but adds ring-buffer latency to the knob; a limiter after the gain in the callback is immediate but must be allocation-free (it can be: fixed-size delay line).

## 1. What VLC, mpv and foobar2000 do

**VLC.**
- Volume is a linear factor. `AOUT_VOLUME_DEFAULT` is 256 and `AOUT_VOLUME_MAX` is 512, so the cap is 200% (`include/vlc_aout.h`).
- `aout_volume_Amplify` computes `amp = output_factor * gain_factor` (user volume times ReplayGain multiplier) and calls the volume module (`src/audio_output/volume.c`). The float32 module (`modules/audio_mixer/float.c`) is `*(p++) *= f_multiplier`, skipping when the factor is 1.0. No clamp, no limiter. Float samples above 1.0 are clipped only when converted to the device format, so it is hard clipping by default.
- The optional "volume normalizer" filter (`modules/audio_filter/normvol.c`, options `norm-buff-size` default 20, `norm-max-level`) keeps a ring of the last N buffers' per-channel RMS (`sqrt(sum x^2)`), averages them, and if the average exceeds `f_max` divides the whole buffer by `average / f_max`. Notes: it only attenuates (never boosts), per-channel (so it can skew stereo image), per-buffer gain steps (zipper noise), and it allocates (`malloc`/`free` per `DoWork`). Not a model to copy.

**mpv.**
- `--volume` 100 = "no volume reduction or amplification"; `--volume-max` default 130 ("about double the normal level" per the manual, loosely worded). `--volume-gain` is a dB offset, range -96..+12 dB by default (`options.rst`).
- Knob to gain is cubic: `gain = pow(volume/100, 3)` times `db_gain(softvol_gain)` (`player/audio.c`). So 130% is about 2.2x (+6.8 dB), and 50% is -18 dB.
- ReplayGain: `--replaygain=track|album`, `--replaygain-preamp`, `--replaygain-clip=no` by default: "mpv automatically will prevent clipping by lowering the gain." `--replaygain-fallback` applies a fixed dB gain to untagged files.
- `af=loudnorm` and `af=dynaudnorm` are libavfilter filters used via `lavfi`; mpv adds nothing of its own. Their behaviour is below (ffmpeg docs).

**foobar2000.**
- Preferences > Playback > Processing offers "apply gain" or "apply gain and prevent clipping according to peak": it lowers the applied gain on tracks whose stored peak would clip, so those tracks end up quieter than the target. Users who want loudness without that use a separate limiter DSP. foobar's own docs were not reachable (Cloudflare 403 on the Hydrogenaudio wiki); this is from forum/search summaries, lower confidence.

**ffmpeg filters (used by mpv).**
- `dynaudnorm`: per-frame (default 500 ms) peak normalisation with Gaussian-smoothed gain, "without dynamic range compressing". Needs look-ahead of frames, so it adds latency and state.
- `loudnorm`: EBU R128 normaliser, default I=-24 LUFS, LRA=7, TP=-2 dBTP, dynamic mode upsamples to 192 kHz for true-peak. A `linear=true` two-pass mode (needs `measured_*` values from a prior scan) scales by a single gain with no dynamics processing.
- `alimiter`: look-ahead limiter, defaults attack 5 ms, release 50 ms, limit 1.0, "the delay it produces is the attack time".

## 2. Candidate approaches

| Approach | Quality | CPU | RT-safe in callback | Latency | Pre-scan | UX |
|---|---|---|---|---|---|---|
| a. Gain >1.0, hard clip | Audible harsh distortion on any track whose peaks exceed 1/gain; fine on genuinely quiet masters at low boost | trivial | yes | 0 | no | Simple, but "loud" slider that breaks loud tracks (VLC behaviour) |
| b1. Gain + look-ahead limiter | Transparent for a few dB of reduction; no hard clipping; peaks never exceed ceiling (sample-peak, or true-peak with oversampling) | low (a few ops/sample; true-peak 4x oversampling adds FIR cost) | yes with fixed delay line and preallocated state | attack time, about 1.5 to 5 ms | no | One knob, "just louder" |
| b2. Gain + soft clipper (tanh/cubic) | Adds harmonic distortion on every peak above the knee, even moderate ones; no latency | trivial (tanh approximation) | yes | 0 | no | Warm sound, but colours music; not "lossless" in spirit |
| c. ReplayGain tags (+ peak clip prevention) | Exact when tags exist, no distortion (gain clamped by peak); quiet-with-high-peak tracks stay quiet | trivial | yes (a constant gain, set on load) | 0 | no (tags read at load); untagged files get nothing | Tracks equal loudness; sourcing tags is the catch |
| d. R128/BS.1770 analysis | Best accuracy: gain to a LUFS target. Scan time: one decode pass per track (done once, cache result). Live: needs seconds of integration, unstable at start | `ebur128` is cheap (K-weight biquads plus gating) but a full-file scan costs a decode | scan in a worker thread, not in the callback; live meter is RT-safe only if state is preallocated | 0 (scanned) or 3 s lookahead (live) | scan: yes | "Normalise volume" toggle; first play of unscanned file needs a wait or a fallback |
| e. Dynamic compression / dynaudnorm-like | Raises quiet passages, flattens dynamics (audible, deliberate); no clipping if peak-aware | moderate, needs frame look-ahead | possible, more state | 0.5 to 1 s | no | "Night mode", not lossless; changes the music |

Notes:
- Only a is free of look-ahead; every clean option needs either a limiter delay (b1) or metadata/scan (c, d).
- ReplayGain and R128 solve "tracks differ in loudness" (aim a track at -18 LUFS, RG 2.0, or -23 LUFS, R128 broadcast). They do not by themselves solve "I want it louder than the file allows" unless the target is above what the track's peak allows, in which case a limiter is needed anyway. RG 2.0 itself tells players to lower gain when the stored peak would clip.
- Sample-peak vs true-peak: inter-sample peaks can exceed 0 dBFS after DAC reconstruction. A true-peak limiter needs 4x oversampling (about 1.5 dB headroom is the usual practical guard); for a music player a -1 dBFS sample-peak ceiling is a common cheap compromise (loudgain's default is -1 dBTP).

## 3. Crates

- `ebur128` 0.1.11 (sdroege, MIT, port of libebur128, deps `bitflags`, `smallvec`, `dasp_*`): EBU R128 M/S/I modes, loudness range, sample and true peak, any sample rate. It allocates at construction (`EbuR128::new`) and on some paths while adding frames (history buffers); the docs do not claim real-time safety, so run it in a worker thread, never the callback. Verdict: use it for phase 2 scanning (d); it is the standard choice. License fits.
- `replaygain` / `bs1770` crates exist; not evaluated. `ebur128` is more current and covers both.
- Limiter/compressor crates: no widely adopted, maintained realtime limiter crate was found in this pass (not exhaustively searched; `dasp` offers `dasp_envelope`, `dasp_peak` primitives and no ready-made lookahead limiter, and is not RT-audited). A lookahead limiter is small, so hand-roll it:
  - fixed delay line of `lookahead = ~1.5 ms * rate` frames, preallocated at construction (`Vec` created once off-callback, never grown);
  - running max of |sample| over the window (or per-frame max across channels, to keep the stereo image linked);
  - target gain = `min(1, ceiling / peak)`; one-pole smoothing: instant attack to the target within the look-ahead window, release about 50 to 100 ms;
  - output = delayed sample times smoothed gain.
  Add a test: peaks above the ceiling never exceed it, signals below the ceiling pass unchanged (after the delay), no allocation (construct once).
- Check dependencies on a changed `Cargo.toml` against the project rule: record any added crate in `docs/DECISIONS.md`.

## 4. Volume curve

- Linear gain is wrong for loudness perception. Both existing and prospective curves are dB-based: the current knob is already exponential (`10^(2(v-1))`, -40..0 dB).
- mpv uses cubic (`v^3`), which is roughly -60 dB at 1% and +6.8 dB at 130%. VLC is linear in its factor (256 = 100%) but VLC's GUI slider is cubic in practice on some interfaces; not verified here.
- Recommended for us: keep the existing exponential 0..1 curve for 0..100% (no change, keeps the current feel and tests), and add boost above 100% as a separate dB value (0..+12 dB) rather than redefining the knob. Rationale: the 0 dB point stays exact and bit-perfect; dB maps directly to ReplayGain preamp and R128 offsets; +6 dB is exactly 2x (VLC's 200%), +12 dB is 4x.
- If a single knob must go past 100%: continue the same exponential beyond v=1 (`10^(2(v-1))` with v up to 1.3 gives +6 dB), and keep 100% as a detent.

## 5. Recommendation

Phase A (smallest useful, ship first):
1. Add a `boost` setting in dB, range 0..+12, default 0 (or +6 if the owner wants a ceiling similar to VLC's 200%).
2. Add one `DspStage`, `BoostLimiter { gain, ceiling_db = -1.0, lookahead_ms = 1.5, release_ms = 80 }`, as the last stage in the chain, after any future EQ and after resampling, so it sees the true final signal. The existing output `gain_for(volume)` stays after it and is attenuate-only (<= 1.0), so it can never cause clipping, and it stays where the level meter taps (post-volume), so meters show what the speakers play.
   - Order: decode, resample, (future EQ), boost + limiter, knob volume, cpal. Boost before volume means the knob still just scales the limited signal.
3. When boost is 0 dB the stage is bypassed entirely (not run), so the delay line is not added and samples are bit-identical. Bit-perfect holds at: boost 0 dB, volume knob at 1.0, and no resample needed (the existing caveat for non-native sample rates). Any boost above 0 dB, or any volume below 100%, is by definition not bit-perfect (a gain multiply), same as today.
4. Smooth boost changes with a short ramp (about 20 ms) to avoid zipper noise; use the existing `AtomicU32` bits pattern for the control, no locks.
5. Latency: the look-ahead adds about 1.5 ms only while boost is on. Position reporting should subtract it or ignore it (below the 50 ms `position` tick, so ignoring is fine).

Protocol shape (Rust, TS and `docs/PROTOCOL.md` change together):
- Preferred: new command `setBoost {boostDb}` (number, clamped 0..12) and add `boostDb` to the `options` event. Reason: keeps `setVolume 0..1` semantic and stable, keeps boost off the knob, and `main` already persists `options` and replays them after a sidecar restart.
- Alternative: extend `setVolume` to 0..2 (rejected: breaks the "1 = bit-perfect" clamp, the existing tests, and the validation in `main`).

Phase B (only if wanted): ReplayGain track/album gain read from tags at load (symphonia exposes tags), applied as a constant gain before the limiter, with clip prevention by lowering gain when `peak * gain > ceiling` (as mpv/foobar do) or by letting the limiter catch it. Tag-less files fall back to 0 dB. Phase C: optional R128 scan with `ebur128` in a worker thread at import/rack time, cached beside `rack.json`, giving a LUFS value per track for the same gain stage.
Skip e (dynamic compression) unless asked; it changes the music and conflicts with the lossless brand.

## Open questions for the product owner

1. Max boost: +6 dB (like VLC's 200%) or +12 dB? Higher values mean more limiter work and more audible pumping on loud masters.
2. Is a limiter acceptable in a "lossless" player? If boost is on, the signal is no longer bit-exact either way; should the UI show a "boost on" indicator (and a limiter-active lamp)?
3. Default: off (0 dB, recommended) vs always on for quiet files. Auto-boost implies phase B or C.
4. Scope of automation: manual boost only now, or ReplayGain/R128 "normalise" toggle next? Where should loudness values be stored (rack.json vs a new cache)?
5. True-peak ceiling (-1 dBTP needs oversampling) or sample-peak -1 dBFS (cheap, can overshoot on some DACs)?
6. UI placement: a second knob or a switch on the existing volume knob; today the knob is already exponential, so keep the detent at 100%?
7. Confirm where `DspChain` runs (decoder thread vs cpal callback) before implementation; this decides the limiter's exact latency and where its delay line lives.

## Sources

- VLC `include/vlc_aout.h` (volume constants): https://raw.githubusercontent.com/videolan/vlc/master/include/vlc_aout.h
- VLC `src/audio_output/volume.c`: https://code.videolan.org/videolan/vlc/-/raw/master/src/audio_output/volume.c
- VLC `modules/audio_mixer/float.c`: https://raw.githubusercontent.com/videolan/vlc/master/modules/audio_mixer/float.c
- VLC `modules/audio_filter/normvol.c`: https://code.videolan.org/videolan/vlc/-/raw/master/modules/audio_filter/normvol.c
- mpv options (volume, volume-max, volume-gain, replaygain): https://raw.githubusercontent.com/mpv-player/mpv/master/DOCS/man/options.rst
- mpv `player/audio.c` (cubic softvol): https://raw.githubusercontent.com/mpv-player/mpv/master/player/audio.c
- FFmpeg filters (dynaudnorm, loudnorm, alimiter): https://ffmpeg.org/ffmpeg-filters.html
- ebur128 crate docs and Cargo.toml: https://docs.rs/ebur128/latest/ebur128/ , https://github.com/sdroege/ebur128
- ReplayGain (background, -18 LUFS target in 2.0, peak tags, clip prevention): https://wiki.hydrogenaud.io/index.php/ReplayGain , https://github.com/Moonbase59/loudgain , https://www.mankier.com/1/rsgain
- foobar2000 "prevent clipping according to peak" (forum summaries): https://hydrogenaudio.org/index.php/topic,122402.0.html , https://www.foobar2000.org/components/view/foo_dsp_replaygain/releases

Not verified from primary sources: EBU R128 (-23 LUFS) and ITU-R BS.1770 specs (not fetched; figures from general knowledge), the official ReplayGain 2.0 spec page and foobar2000 docs (blocked), `ebur128` per-call allocation behaviour, and VLC's replay-gain peak handling.
