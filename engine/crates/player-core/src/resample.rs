//! Rubato-based sample-rate converter (interleaved f32 in, interleaved f32 out).

use rubato::audioadapter_buffers::direct::InterleavedSlice;
use rubato::{Fft, FixedSync, Indexing, Resampler as _};

use crate::error::{ErrorCode, PlayerError};

/// Target input chunk (frames). The FFT resampler works on whole chunks, so input is buffered
/// until a full chunk is available. 1024 frames is ~23 ms at 44.1 kHz: small enough that the
/// extra latency at start/seek is irrelevant, large enough to keep per-chunk overhead low.
/// (`Fft::new` splits it into ~256-frame sub-chunks, which keeps the filter delay ~128 frames.)
const CHUNK_FRAMES: usize = 1024;

struct FftState {
    fft: Fft<f32>,
    channels: usize,
    in_rate: u64,
    out_rate: u64,
    /// Interleaved input not yet consumed (always < one chunk after `process`).
    pending: Vec<f32>,
    /// Scratch input chunk (zero padded for partial chunks).
    chunk_in: Vec<f32>,
    /// Scratch output buffer, sized for the largest output chunk.
    chunk_out: Vec<f32>,
    /// Leading output frames still to discard (filter delay compensation).
    delay_left: usize,
    total_in_frames: u64,
    total_out_frames: u64,
    /// Sticky: set when rubato reports an error (output is then incomplete).
    failed: bool,
}

enum Mode {
    Passthrough,
    Fft(Box<FftState>),
}

pub struct Resampler {
    mode: Mode,
}

fn internal(e: impl std::fmt::Display) -> PlayerError {
    PlayerError::new(ErrorCode::Internal, format!("resampler: {e}"))
}

impl Resampler {
    pub fn new(in_rate: u32, out_rate: u32, channels: u16) -> Result<Self, PlayerError> {
        if in_rate == 0 || out_rate == 0 || channels == 0 {
            return Err(internal("rates and channel count must be non-zero"));
        }
        if in_rate == out_rate {
            return Ok(Self { mode: Mode::Passthrough });
        }
        let ch = usize::from(channels);
        // Fixed ratio -> synchronous FFT resampler (best quality/CPU for this case).
        // Fixed input size means we can hand it plain chunks and keep any remainder.
        let fft = Fft::<f32>::new(
            in_rate as usize,
            out_rate as usize,
            CHUNK_FRAMES,
            ch,
            FixedSync::Input,
        )
        .map_err(internal)?;
        let chunk_in = vec![0.0; fft.input_frames_max() * ch];
        let chunk_out = vec![0.0; fft.output_frames_max() * ch];
        let delay_left = fft.output_delay();
        Ok(Self {
            mode: Mode::Fft(Box::new(FftState {
                fft,
                channels: ch,
                in_rate: u64::from(in_rate),
                out_rate: u64::from(out_rate),
                pending: Vec::new(),
                chunk_in,
                chunk_out,
                delay_left,
                total_in_frames: 0,
                total_out_frames: 0,
                failed: false,
            })),
        })
    }

    /// `input` is interleaved and may be any length; interleaved output is appended to `out`.
    /// Partial chunks stay buffered until more input (or `flush`) arrives.
    pub fn process(&mut self, input: &[f32], out: &mut Vec<f32>) {
        match &mut self.mode {
            Mode::Passthrough => out.extend_from_slice(input),
            Mode::Fft(s) => s.process(input, out),
        }
    }

    /// Discards all internal state without emitting anything (call after seek/stop/load).
    pub fn reset(&mut self) {
        if let Mode::Fft(s) = &mut self.mode {
            s.reset();
        }
    }

    /// True once rubato has reported an error; the output is then incomplete.
    pub fn has_failed(&self) -> bool {
        matches!(&self.mode, Mode::Fft(s) if s.failed)
    }

    /// Drains the buffered tail at end of stream (appends to `out`) and resets the resampler.
    pub fn flush(&mut self, out: &mut Vec<f32>) {
        if let Mode::Fft(s) = &mut self.mode {
            s.flush(out);
        }
    }
}

impl FftState {
    fn reset(&mut self) {
        self.fft.reset();
        self.pending.clear();
        self.delay_left = self.fft.output_delay();
        self.total_in_frames = 0;
        self.total_out_frames = 0;
    }

    fn process(&mut self, input: &[f32], out: &mut Vec<f32>) {
        // Ignore a trailing incomplete frame (cannot occur with well-formed decoder output).
        let usable = input.len() - input.len() % self.channels;
        self.pending.extend_from_slice(&input[..usable]);
        self.total_in_frames += (usable / self.channels) as u64;

        let mut consumed = 0usize; // in samples
        loop {
            let need = self.fft.input_frames_next() * self.channels;
            if self.pending.len() - consumed < need {
                break;
            }
            self.chunk_in[..need].copy_from_slice(&self.pending[consumed..consumed + need]);
            consumed += need;
            self.run_chunk(None, out, u64::MAX);
        }
        self.pending.drain(..consumed);
    }

    fn flush(&mut self, out: &mut Vec<f32>) {
        let expected = (self.total_in_frames * self.out_rate).div_ceil(self.in_rate);
        let ch = self.channels;

        // Feed the leftover (zero padded, `partial_len` tells rubato how much is real), then keep
        // feeding silence until the filter delay has been flushed out and we have `expected` frames.
        let mut real_frames = self.pending.len() / ch;
        let need = self.fft.input_frames_next() * ch;
        self.chunk_in[..need].fill(0.0);
        self.chunk_in[..self.pending.len()].copy_from_slice(&self.pending);
        self.pending.clear();

        // Bounded: every chunk yields output, so this ends within a few chunks.
        for _ in 0..64 {
            if self.total_out_frames >= expected {
                break;
            }
            self.run_chunk(Some(real_frames), out, expected);
            real_frames = 0;
            let need = self.fft.input_frames_next() * ch;
            self.chunk_in[..need].fill(0.0);
        }

        self.reset();
    }

    /// Resamples `chunk_in` (already filled) and appends the result, honouring delay and the
    /// `limit` on total output frames.
    fn run_chunk(&mut self, partial: Option<usize>, out: &mut Vec<f32>, limit: u64) {
        let ch = self.channels;
        let in_frames = self.fft.input_frames_next();
        let out_frames = self.fft.output_frames_next();
        let indexing = partial.map(|n| Indexing::new().partial_len(n));
        let (Ok(inp), Ok(mut outp)) = (
            InterleavedSlice::new(&self.chunk_in[..in_frames * ch], ch, in_frames),
            InterleavedSlice::new_mut(&mut self.chunk_out[..out_frames * ch], ch, out_frames),
        ) else {
            self.failed = true; // never panic on the audio path; surface via has_failed()
            return;
        };
        let Ok((_, produced)) = self.fft.process_into_buffer(&inp, &mut outp, indexing.as_ref())
        else {
            self.failed = true; // never panic on the audio path; surface via has_failed()
            return;
        };

        let skip = self.delay_left.min(produced);
        self.delay_left -= skip;
        let room = limit.saturating_sub(self.total_out_frames);
        let take = ((produced - skip) as u64).min(room) as usize;
        out.extend_from_slice(&self.chunk_out[skip * ch..(skip + take) * ch]);
        self.total_out_frames += take as u64;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn passthrough_is_identity() {
        let mut r = Resampler::new(48000, 48000, 2).unwrap();
        let input: Vec<f32> = (0..1000).map(|i| i as f32 * 0.001).collect();
        let mut out = vec![9.0];
        r.process(&input[..333], &mut out);
        r.process(&input[333..], &mut out);
        r.flush(&mut out);
        assert_eq!(out[0], 9.0);
        assert_eq!(&out[1..], &input[..]);
    }

    #[test]
    fn reset_matches_fresh_resampler() {
        let input: Vec<f32> = (0..6000).map(|i| ((i as f32) * 0.01).sin() * 0.5).collect();
        let run = |r: &mut Resampler| {
            let mut out = Vec::new();
            r.process(&input, &mut out);
            r.flush(&mut out);
            out
        };
        let fresh = run(&mut Resampler::new(44100, 48000, 2).unwrap());
        let mut r = Resampler::new(44100, 48000, 2).unwrap();
        let mut sink = Vec::new();
        r.process(&input[..2500], &mut sink);
        r.reset();
        assert_eq!(run(&mut r), fresh);
        assert!(!r.has_failed());
    }

    #[test]
    fn resamples_44100_to_48000_stereo_in_uneven_pieces() {
        let mut r = Resampler::new(44100, 48000, 2).unwrap();
        let frames = 44100usize;
        let input: Vec<f32> = (0..frames)
            .flat_map(|i| {
                let v = (2.0 * std::f32::consts::PI * 440.0 * i as f32 / 44100.0).sin() * 0.5;
                [v, -v]
            })
            .collect();
        let mut out = Vec::new();
        let mut pos = 0;
        let mut piece = 1;
        while pos < frames {
            let n = piece.min(frames - pos);
            r.process(&input[pos * 2..(pos + n) * 2], &mut out);
            pos += n;
            piece = piece * 3 + 7; // uneven growing pieces
        }
        r.flush(&mut out);
        assert_eq!(out.len() % 2, 0);
        let out_frames = out.len() / 2;
        assert!(
            (out_frames as f64 - 48000.0).abs() <= 480.0,
            "got {out_frames} frames"
        );
        let peak = out.iter().fold(0.0f32, |m, v| m.max(v.abs()));
        assert!((peak - 0.5).abs() < 0.05, "peak {peak}");
    }
}
