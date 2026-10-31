//! cpal output stream fed by a lock-free ring buffer.
//!
//! The player thread pushes interleaved `f32` samples (already resampled to the
//! device's native rate and mapped to its channel count) into an `rtrb` ring.
//! The real-time audio callback pops from the ring and converts to the device's
//! sample format. All cross-thread state is atomics; the callback never locks.

use std::sync::Arc;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};

use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{FromSample, I24, Sample, SampleFormat, SizedSample, Stream, StreamConfig, U24};
use rtrb::{Consumer, Producer, RingBuffer};

use crate::error::{ErrorCode, PlayerError};

/// The device's native output format; the player must feed exactly this.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct OutputConfig {
    pub sample_rate: u32,
    pub channels: u16,
}

/// State shared between the control side and the audio callback. Atomics only.
#[derive(Debug, Default)]
struct Shared {
    /// False: callback emits silence and leaves the ring untouched.
    playing: AtomicBool,
    /// Bumped by `clear`; the callback drains the ring whenever it differs from
    /// `clear_ack`.
    clear_gen: AtomicU64,
    /// Last clear generation the callback has fully honoured (stored after the
    /// drain, so observing ack == gen means the drain is complete).
    clear_ack: AtomicU64,
    /// Whole frames actually handed to the device from the ring.
    frames_played: AtomicU64,
    /// Set by the stream error callback on a fatal device error.
    failed: AtomicBool,
}

/// Handle to the running output stream. Dropping it stops audio.
///
/// Send-ness: this holds a `cpal::Stream`. On cpal 0.18.2 / ALSA the stream is
/// `Send` (verified by a compile-time assertion in the tests), but cpal
/// documents `Stream` as `!Send` on some platforms (e.g. CoreAudio/WASM), so the
/// player task should create and own `Output` on one thread and not move it.
///
/// Capacity guidance: pass roughly 0.5-1 s of frames (e.g. the sample rate / 2
/// to sample rate) as `capacity_frames` to `open_default`.
pub struct Output {
    shared: Arc<Shared>,
    _stream: Stream,
}

impl Output {
    /// Open the default host's default output device with its default config,
    /// start the stream, and return the ring producer plus the native config.
    /// The ring holds `capacity_frames * channels` interleaved samples.
    pub fn open_default(
        capacity_frames: usize,
    ) -> Result<(Output, Producer<f32>, OutputConfig), PlayerError> {
        let host = cpal::default_host();
        let device = host
            .default_output_device()
            .ok_or_else(|| PlayerError::new(ErrorCode::NoOutputDevice, "no default output device"))?;
        let supported = device.default_output_config().map_err(map_err)?;
        let format = supported.sample_format();
        let config: StreamConfig = supported.into();
        let channels = config.channels;
        let out_config = OutputConfig { sample_rate: config.sample_rate, channels };

        let (producer, consumer) =
            RingBuffer::<f32>::new(capacity_frames.max(1) * usize::from(channels));
        let shared = Arc::new(Shared::default());

        let stream = match format {
            SampleFormat::F32 => build::<f32>(&device, config, consumer, &shared),
            SampleFormat::F64 => build::<f64>(&device, config, consumer, &shared),
            SampleFormat::I8 => build::<i8>(&device, config, consumer, &shared),
            SampleFormat::I16 => build::<i16>(&device, config, consumer, &shared),
            SampleFormat::I24 => build::<I24>(&device, config, consumer, &shared),
            SampleFormat::I32 => build::<i32>(&device, config, consumer, &shared),
            SampleFormat::U8 => build::<u8>(&device, config, consumer, &shared),
            SampleFormat::U16 => build::<u16>(&device, config, consumer, &shared),
            SampleFormat::U24 => build::<U24>(&device, config, consumer, &shared),
            SampleFormat::U32 => build::<u32>(&device, config, consumer, &shared),
            other => {
                return Err(PlayerError::new(
                    ErrorCode::NoOutputDevice,
                    format!("unsupported output sample format {other}"),
                ));
            }
        }?;
        stream.play().map_err(map_err)?;

        Ok((Output { shared, _stream: stream }, producer, out_config))
    }

    /// `false`: the callback outputs silence and does not consume the ring.
    pub fn set_playing(&self, playing: bool) {
        // Relaxed: independent flag, no other data is published through it.
        self.shared.playing.store(playing, Ordering::Relaxed);
    }

    /// Request that everything buffered be dropped. This only posts a request;
    /// the callback drains the ring on its next run (even while paused).
    ///
    /// Required player protocol: call `clear()`, wait until `!clear_pending()`
    /// (poll with a short sleep on the player thread, never in the callback),
    /// then `reset_frames(x)`, then push new samples. If the stream is not
    /// running (callbacks stopped) `clear_pending` never becomes false; stop
    /// waiting once `has_failed()` is true.
    pub fn clear(&self) {
        // Release pairs with the callback's Acquire load of the generation.
        self.shared.clear_gen.fetch_add(1, Ordering::Release);
    }

    /// True while a `clear()` has not yet been fully honoured by the callback.
    pub fn clear_pending(&self) -> bool {
        // Acquire on ack pairs with the callback's Release store after the drain.
        self.shared.clear_ack.load(Ordering::Acquire)
            != self.shared.clear_gen.load(Ordering::Acquire)
    }

    /// Frames written to the device from the ring since the last reset.
    pub fn frames_played(&self) -> u64 {
        self.shared.frames_played.load(Ordering::Relaxed)
    }

    /// Set the frame counter (used after a seek).
    pub fn reset_frames(&self, frames: u64) {
        self.shared.frames_played.store(frames, Ordering::Relaxed);
    }

    /// True once the stream's error callback reported a fatal device error.
    pub fn has_failed(&self) -> bool {
        self.shared.failed.load(Ordering::Acquire)
    }
}

fn map_err(e: cpal::Error) -> PlayerError {
    // Every failure to get a working output stream is reported as NoOutputDevice.
    PlayerError::new(ErrorCode::NoOutputDevice, e.to_string())
}

fn build<T>(
    device: &cpal::Device,
    config: StreamConfig,
    mut consumer: Consumer<f32>,
    shared: &Arc<Shared>,
) -> Result<Stream, PlayerError>
where
    T: SizedSample + FromSample<f32>,
{
    let channels = usize::from(config.channels);
    let cb_shared = Arc::clone(shared);
    let err_shared = Arc::clone(shared);
    device
        .build_output_stream(
            config,
            move |data: &mut [T], _: &cpal::OutputCallbackInfo| {
                // REAL-TIME CALLBACK: must not allocate, lock, log, print or
                // block. Any of those can stall the audio thread past its
                // deadline and cause audible glitches. Atomics and the
                // lock-free ring only.
                render(&mut consumer, data, channels, &cb_shared);
            },
            move |err: cpal::Error| {
                // Not the realtime audio callback, but we still avoid logging; the
                // control side polls `has_failed`.
                // Transient conditions are not fatal.
                use cpal::ErrorKind::*;
                if !matches!(err.kind(), DeviceChanged | Xrun | RealtimeDenied) {
                    err_shared.failed.store(true, Ordering::Release);
                }
            },
            None,
        )
        .map_err(map_err)
}

/// Device-independent callback body.
fn render<T: Sample + FromSample<f32>>(
    consumer: &mut Consumer<f32>,
    out: &mut [T],
    channels: usize,
    shared: &Shared,
) {
    // Acquire pairs with `clear`'s Release. Checked before `playing` so a clear
    // is honoured while paused. Only this callback writes `clear_ack`.
    let gen_seen = shared.clear_gen.load(Ordering::Acquire);
    if gen_seen != shared.clear_ack.load(Ordering::Relaxed) {
        let n = consumer.slots();
        if let Ok(chunk) = consumer.read_chunk(n) {
            chunk.commit_all();
        }
        out.fill(T::EQUILIBRIUM);
        // Ack strictly after the drain (and with no frames_played update on this
        // call): once the player sees ack == gen, no stale write can follow.
        shared.clear_ack.store(gen_seen, Ordering::Release);
        return;
    }
    if !shared.playing.load(Ordering::Relaxed) {
        out.fill(T::EQUILIBRIUM);
        return;
    }
    let channels = channels.max(1);
    let frames = (consumer.slots() / channels).min(out.len() / channels);
    let n = frames * channels;
    if n > 0
        && let Ok(chunk) = consumer.read_chunk(n)
    {
        let (a, b) = chunk.as_slices();
        for (dst, src) in out.iter_mut().zip(a.iter().chain(b.iter())) {
            *dst = T::from_sample(*src);
        }
        chunk.commit_all();
    }
    out[n..].fill(T::EQUILIBRIUM);
    if frames > 0 {
        shared.frames_played.fetch_add(frames as u64, Ordering::Relaxed);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn setup(samples: &[f32]) -> (Producer<f32>, Consumer<f32>, Shared) {
        let (mut p, c) = RingBuffer::<f32>::new(64);
        for s in samples {
            p.push(*s).unwrap();
        }
        let shared = Shared::default();
        (p, c, shared)
    }

    #[test]
    fn output_is_send_on_this_platform() {
        fn assert_send<T: Send>() {}
        assert_send::<Output>();
    }

    #[test]
    fn paused_outputs_silence_and_consumes_nothing() {
        let (_p, mut c, shared) = setup(&[0.5; 8]);
        let mut out = [1.0f32; 8];
        render(&mut c, &mut out, 2, &shared);
        assert_eq!(out, [0.0; 8]);
        assert_eq!(c.slots(), 8);
        assert_eq!(shared.frames_played.load(Ordering::Relaxed), 0);
    }

    #[test]
    fn playing_copies_whole_frames() {
        let src: Vec<f32> = (0..8).map(|i| i as f32 / 10.0).collect();
        let (_p, mut c, shared) = setup(&src);
        shared.playing.store(true, Ordering::Relaxed);
        let mut out = [9.0f32; 8];
        render(&mut c, &mut out, 2, &shared);
        assert_eq!(out.as_slice(), src.as_slice());
        assert_eq!(shared.frames_played.load(Ordering::Relaxed), 4);
        assert_eq!(c.slots(), 0);
    }

    #[test]
    fn underrun_copies_partial_then_zeros() {
        // 3 samples at 2 channels: 1 whole frame; the dangling sample is left.
        let (_p, mut c, shared) = setup(&[0.1, 0.2, 0.3]);
        shared.playing.store(true, Ordering::Relaxed);
        let mut out = [9.0f32; 6];
        render(&mut c, &mut out, 2, &shared);
        assert_eq!(out, [0.1, 0.2, 0.0, 0.0, 0.0, 0.0]);
        assert_eq!(shared.frames_played.load(Ordering::Relaxed), 1);
        assert_eq!(c.slots(), 1);
    }

    #[test]
    fn clear_drains_acks_and_is_silent() {
        let (_p, mut c, shared) = setup(&[0.5; 8]);
        shared.playing.store(true, Ordering::Relaxed);
        shared.clear_gen.fetch_add(1, Ordering::Release);
        assert_ne!(
            shared.clear_gen.load(Ordering::Relaxed),
            shared.clear_ack.load(Ordering::Relaxed)
        );
        let mut out = [1.0f32; 4];
        render(&mut c, &mut out, 2, &shared);
        assert_eq!(out, [0.0; 4]);
        assert_eq!(c.slots(), 0);
        assert_eq!(
            shared.clear_gen.load(Ordering::Relaxed),
            shared.clear_ack.load(Ordering::Relaxed)
        );
        assert_eq!(shared.frames_played.load(Ordering::Relaxed), 0);
    }

    #[test]
    fn clear_honoured_while_paused() {
        let (_p, mut c, shared) = setup(&[0.5; 8]);
        shared.clear_gen.fetch_add(1, Ordering::Release);
        let mut out = [1.0f32; 4];
        render(&mut c, &mut out, 2, &shared);
        assert_eq!(c.slots(), 0);
        assert_eq!(shared.clear_ack.load(Ordering::Relaxed), 1);
    }

    #[test]
    fn push_after_ack_survives_next_render() {
        let (mut p, mut c, shared) = setup(&[0.5; 8]);
        shared.playing.store(true, Ordering::Relaxed);
        shared.clear_gen.fetch_add(1, Ordering::Release);
        let mut out = [1.0f32; 4];
        render(&mut c, &mut out, 2, &shared);
        p.push(0.25).unwrap();
        p.push(0.75).unwrap();
        render(&mut c, &mut out, 2, &shared);
        assert_eq!(out, [0.25, 0.75, 0.0, 0.0]);
        assert_eq!(shared.frames_played.load(Ordering::Relaxed), 1);
    }

    #[test]
    fn i16_conversion_of_half_scale() {
        let (_p, mut c, shared) = setup(&[0.5, 0.5]);
        shared.playing.store(true, Ordering::Relaxed);
        let mut out = [0i16; 2];
        render(&mut c, &mut out, 2, &shared);
        assert!((i32::from(out[0]) - 16383).abs() <= 1, "got {}", out[0]);
    }
}
