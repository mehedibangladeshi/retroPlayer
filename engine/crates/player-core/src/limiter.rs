//! Boost gain followed by a look-ahead peak limiter, so quiet tracks can be
//! raised up to +12 dB without clipping. Runs in the cpal audio callback on
//! interleaved f32 at the device rate, so `process` never allocates, locks,
//! logs or blocks: every buffer is sized once in `new`.
//!
//! Algorithm (per frame): the boosted frame goes into a delay line of `L`
//! frames. Its needed gain `min(1, ceiling / peak)` goes into a ring of the
//! last `L + 1` such gains; the ring's minimum (the gain the loudest frame
//! still in the delay needs) drives an envelope that falls instantly and
//! rises with the release time. The envelope is then box-averaged over the
//! last `L + 1` frames and applied to the frame leaving the delay. Every
//! envelope value in that average was computed while the outgoing frame was
//! inside the min window, so each is <= that frame's needed gain, and so is
//! their mean: the output never passes the ceiling, and the attack is a
//! smooth ramp spread over the look-ahead instead of a step.
//!
//! At exactly 0 dB nothing is limited: full-scale input stays full-scale and
//! the output is the input delayed, bit for bit. That is by design, so unity
//! playback stays lossless; the ceiling only applies while boosting.

const LOOKAHEAD_S: f32 = 0.0015;
const RELEASE_S: f32 = 0.08;
const RAMP_S: f32 = 0.02;
const MAX_BOOST_DB: f32 = 12.0;
/// -1 dBFS sample peak.
const CEILING: f32 = 0.891_250_9;

pub struct Limiter {
    channels: usize,
    /// Look-ahead in frames (`L`).
    lookahead: usize,
    /// Interleaved delay line, `L` frames.
    delay: Vec<f32>,
    delay_pos: usize,
    /// Needed gain of the last `L + 1` input frames.
    need: Vec<f32>,
    /// Envelope of the last `L + 1` frames, box-averaged into the applied gain.
    env_hist: Vec<f32>,
    hist_pos: usize,
    env: f32,
    release_coef: f32,
    /// Boost ramp: current gain, its target, per-frame step and frames left.
    gain: f32,
    target: f32,
    step: f32,
    ramp_left: u32,
    ramp_frames: u32,
    /// After `new`/`reset` the next target is taken at once, not ramped.
    snap: bool,
}

impl Limiter {
    pub fn new(channels: usize, sample_rate: u32) -> Self {
        let channels = channels.max(1);
        let sr = sample_rate.max(1) as f32;
        let lookahead = ((sr * LOOKAHEAD_S).round() as usize).max(1);
        let mut l = Self {
            channels,
            lookahead,
            delay: vec![0.0; lookahead * channels],
            delay_pos: 0,
            need: vec![1.0; lookahead + 1],
            env_hist: vec![1.0; lookahead + 1],
            hist_pos: 0,
            env: 1.0,
            release_coef: 1.0 - (-1.0 / (RELEASE_S * sr)).exp(),
            gain: 1.0,
            target: 1.0,
            step: 0.0,
            ramp_left: 0,
            ramp_frames: ((sr * RAMP_S).round() as u32).max(1),
            snap: true,
        };
        l.reset();
        l
    }

    /// Clears the delay line, envelope and ramp (seek, load, stop flush).
    pub fn reset(&mut self) {
        self.delay.fill(0.0);
        self.need.fill(1.0);
        self.env_hist.fill(1.0);
        self.delay_pos = 0;
        self.hist_pos = 0;
        self.env = 1.0;
        self.ramp_left = 0;
        self.snap = true;
    }

    /// Boosts by `boost_db` (clamped to 0..=12, NaN = 0) and limits, in place.
    /// The output is always delayed by the look-ahead, even at 0 dB, so
    /// toggling boost never shifts the timeline.
    pub fn process(&mut self, buf: &mut [f32], boost_db: f32) {
        let db = if boost_db.is_nan() { 0.0 } else { boost_db.clamp(0.0, MAX_BOOST_DB) };
        // Exactly 1.0 at 0 dB, so the bypass check below can be exact.
        let target = if db == 0.0 { 1.0 } else { 10f32.powf(db / 20.0) };
        debug_assert!(buf.len().is_multiple_of(self.channels), "partial trailing frame would bypass the limiter");
        if buf.is_empty() {
            return;
        }
        if self.snap {
            self.snap = false;
            self.gain = target;
            self.target = target;
            self.ramp_left = 0;
        } else if target != self.target {
            self.target = target;
            self.step = (target - self.gain) / self.ramp_frames as f32;
            self.ramp_left = self.ramp_frames;
        }

        let ch = self.channels;
        let hist_len = self.lookahead + 1;
        for frame in buf.chunks_exact_mut(ch) {
            if self.ramp_left > 0 {
                self.ramp_left -= 1;
                self.gain = if self.ramp_left == 0 { self.target } else { self.gain + self.step };
            }
            // Bypass: unity boost, settled. Samples pass untouched and ask for no reduction.
            let bypass = self.gain == 1.0 && self.ramp_left == 0;

            let mut peak = 0.0f32;
            let slot = &mut self.delay[self.delay_pos * ch..(self.delay_pos + 1) * ch];
            for (s, d) in frame.iter_mut().zip(slot.iter_mut()) {
                let x = if bypass { *s } else { *s * self.gain };
                peak = peak.max(x.abs());
                // Swap: the frame leaving the delay goes out, the new one goes in.
                *s = std::mem::replace(d, x);
            }
            self.delay_pos = (self.delay_pos + 1) % self.lookahead;

            self.need[self.hist_pos] = if bypass || peak <= CEILING { 1.0 } else { CEILING / peak };
            // Plain scans over L+1 (~73 at 48 kHz): cheap, branch-light and drift-free.
            let need_min = self.need.iter().fold(1.0f32, |m, &g| m.min(g));
            self.env = if need_min < self.env {
                need_min
            } else {
                let e = self.env + (need_min - self.env) * self.release_coef;
                // Snap home so a settled envelope is exactly 1.0 again.
                // The f32 increment rounds to zero near 1.0, so the gap must snap well above an ulp.
                if need_min - e < 1e-3 { need_min } else { e }
            };
            self.env_hist[self.hist_pos] = self.env;
            self.hist_pos = (self.hist_pos + 1) % hist_len;

            let g = self.env_hist.iter().sum::<f32>() / hist_len as f32;
            if g < 1.0 {
                frame.iter_mut().for_each(|s| *s *= g);
            }
        }
    }
}
#[cfg(test)]
mod tests {
    use super::*;

    const SR: u32 = 48_000;
    const CEIL: f32 = 0.891_250_9; // 10^(-1/20)

    fn lookahead(sr: u32) -> usize {
        ((sr as f32) * 0.0015).round() as usize
    }

    /// Runs `input` through `lim` in chunks of the given frame sizes (cycled).
    fn run_chunked(lim: &mut Limiter, input: &[f32], ch: usize, chunks: &[usize], db: f32) -> Vec<f32> {
        let mut out = input.to_vec();
        let mut i = 0;
        let mut c = 0;
        while i < out.len() {
            let n = (chunks[c % chunks.len()] * ch).min(out.len() - i);
            lim.process(&mut out[i..i + n], db);
            i += n;
            c += 1;
        }
        out
    }

    fn sine(frames: usize, ch: usize, amp: f32, hz: f32) -> Vec<f32> {
        (0..frames * ch)
            .map(|i| amp * (2.0 * std::f32::consts::PI * hz * (i / ch) as f32 / SR as f32).sin())
            .collect()
    }

    #[test]
    fn zero_db_is_a_bit_exact_delay() {
        let ch = 2;
        let frames = 5000;
        // Pseudo-random input including exact full-scale samples.
        let mut seed = 12345u32;
        let input: Vec<f32> = (0..frames * ch)
            .map(|i| {
                seed = seed.wrapping_mul(1_664_525).wrapping_add(1_013_904_223);
                match i % 7 {
                    0 => 1.0,
                    1 => -1.0,
                    _ => (seed >> 8) as f32 / (1u32 << 23) as f32 - 1.0,
                }
            })
            .collect();
        let mut lim = Limiter::new(ch, SR);
        let out = run_chunked(&mut lim, &input, ch, &[1, 7, 333, 0, 129, 2049], 0.0);
        let d = lookahead(SR) * ch;
        assert!(out[..d].iter().all(|s| *s == 0.0));
        for (o, i) in out[d..].iter().zip(&input) {
            assert_eq!(o.to_bits(), i.to_bits());
        }
    }

    /// Limits a loud signal at +12 dB, drops to 0 dB, lets ramp + release settle,
    /// then checks the output is the input delayed, bit for bit.
    fn assert_exact_after_limiting(sr: u32) {
        let ch = 2;
        let mut lim = Limiter::new(ch, sr);
        let mut loud: Vec<f32> = (0..sr as usize * ch)
            .map(|i| (2.0 * std::f32::consts::PI * 997.0 * (i / ch) as f32 / sr as f32).sin())
            .collect();
        lim.process(&mut loud, 12.0);
        let mut settle = vec![0.5f32; 2 * sr as usize * ch];
        lim.process(&mut settle, 0.0);
        let input: Vec<f32> = (0..4000 * ch)
            .map(|i| match i % 5 {
                0 => 1.0,
                1 => -1.0,
                _ => ((i * 2654435761) % 1000) as f32 / 500.0 - 1.0,
            })
            .collect();
        let mut out = input.clone();
        lim.process(&mut out, 0.0);
        let d = lookahead(sr) * ch;
        // The first `d` samples are the tail of `settle` (0.5), then the input.
        assert!(out[..d].iter().all(|s| *s == 0.5));
        for (o, i) in out[d..].iter().zip(&input) {
            assert_eq!(o.to_bits(), i.to_bits());
        }
    }

    #[test]
    fn zero_db_bit_exact_after_limiting() {
        assert_exact_after_limiting(SR);
        assert_exact_after_limiting(192_000);
    }

    #[test]
    fn plus_12_db_never_exceeds_ceiling() {
        let ch = 2;
        let frames = SR as usize; // 1 s
        let sig = sine(frames, ch, 1.0, 997.0);
        // Square wave and an impulse train too.
        let square: Vec<f32> = (0..frames * ch).map(|i| if (i / ch / 37) % 2 == 0 { 1.0 } else { -1.0 }).collect();
        let impulses: Vec<f32> = (0..frames * ch).map(|i| if (i / ch) % 500 == 0 { 1.0 } else { 0.01 }).collect();
        for input in [sig, square, impulses] {
            let mut lim = Limiter::new(ch, SR);
            let out = run_chunked(&mut lim, &input, ch, &[64, 113, 1024, 5], 12.0);
            let max = out.iter().fold(0.0f32, |m, s| m.max(s.abs()));
            assert!(max <= CEIL + 1e-6, "peak {max} over ceiling");
            assert!(max > CEIL * 0.9, "limiter too aggressive: {max}");
        }
    }

    #[test]
    fn plus_6_db_below_ceiling_is_plain_gain() {
        let ch = 2;
        let amp = 0.1; // -20 dBFS
        let input = sine(SR as usize, ch, amp, 440.0);
        let mut lim = Limiter::new(ch, SR);
        let out = run_chunked(&mut lim, &input, ch, &[480], 6.0);
        let tail = &out[out.len() / 2..];
        let peak = tail.iter().fold(0.0f32, |m, s| m.max(s.abs()));
        let want = amp * 10f32.powf(6.0 / 20.0);
        assert!((peak - want).abs() / want < 0.02, "peak {peak}, want {want}");
    }

    #[test]
    fn reset_clears_delay() {
        let ch = 2;
        let mut lim = Limiter::new(ch, SR);
        let mut loud = vec![1.0f32; 1000 * ch];
        lim.process(&mut loud, 12.0);
        lim.reset();
        let mut silence = vec![0.0f32; 1000 * ch];
        lim.process(&mut silence, 12.0);
        assert!(silence.iter().all(|s| *s == 0.0));

        // An unreset envelope would still attenuate a loud signal at 0 dB.
        let mut lim = Limiter::new(ch, SR);
        let mut loud = vec![1.0f32; 1000 * ch];
        lim.process(&mut loud, 12.0);
        lim.reset();
        let input = vec![1.0f32; 1000 * ch];
        let mut out = input.clone();
        lim.process(&mut out, 0.0);
        let d = lookahead(SR) * ch;
        assert!(out[..d].iter().all(|s| *s == 0.0));
        for (o, i) in out[d..].iter().zip(&input) {
            assert_eq!(o.to_bits(), i.to_bits());
        }
    }

    #[test]
    fn boost_change_ramps() {
        let ch = 1;
        let amp = 0.1;
        let mut lim = Limiter::new(ch, SR);
        let mut a = vec![amp; 4800];
        lim.process(&mut a, 0.0);
        let mut b = vec![amp; 4800];
        lim.process(&mut b, 6.0);
        let ramp_frames = (SR as f32 * 0.02).round();
        let step = amp * (10f32.powf(6.0 / 20.0) - 1.0) / ramp_frames;
        let all: Vec<f32> = a.iter().chain(&b).copied().collect();
        // Skip the silent look-ahead at the very start.
        for w in all[lookahead(SR)..].windows(2) {
            assert!((w[1] - w[0]).abs() <= step * 1.01 + 1e-7, "jump {} > {step}", (w[1] - w[0]).abs());
        }
        // And it does arrive at the target.
        assert!((all[all.len() - 1] - amp * 10f32.powf(6.0 / 20.0)).abs() < 1e-5);
    }

    #[test]
    fn empty_buffer_and_bad_boost_are_safe() {
        let mut lim = Limiter::new(2, SR);
        lim.process(&mut [], 6.0);
        let mut buf = vec![0.5f32; 2000];
        lim.process(&mut buf, f32::NAN);
        let d = lookahead(SR) * 2;
        assert!(buf[d..].iter().all(|s| *s == 0.5));
    }
}
