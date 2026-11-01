//! The player: wires Decoder -> DspChain -> Resampler -> channel map -> rtrb
//! ring -> cpal `Output`, owns the transport state machine and emits events.
//!
//! Thread layout (one worker per opened `Output`):
//! - Control side (`Player`, the caller's thread): validates, mutates the
//!   transport, flips the output's `playing` flag, and sends commands to the
//!   worker, waiting for its reply when the result matters (load/seek/stop).
//! - Worker thread: owns the ring `Producer`, the `Decoder`, `Resampler`,
//!   `DspChain` and scratch buffers. It decodes ahead into the ring, emits
//!   `Position` ticks while playing, detects end-of-track and async failures.
//! - Audio callback (inside `Output`): only atomics plus the ring consumer.
//!
//! Shared state is `Arc<Mutex<Inner>>`. The audio callback never touches it, so
//! a mutex is fine. Rule against deadlock: the control side NEVER holds the
//! lock while waiting for a worker reply (the worker takes the lock itself).

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::mpsc::{self, Receiver, RecvTimeoutError, Sender, TryRecvError};
use std::sync::{Arc, Mutex, MutexGuard};
use std::thread::{self, JoinHandle};
use std::time::{Duration, Instant};

use crate::decode::Decoder;
use crate::dsp::DspChain;
use crate::error::{ErrorCode, PlayerError};
use crate::output::{Clip, Output, OutputConfig, OutputHandle};
use crate::resample::Resampler;
use crate::sound::Sound;
use crate::state::{Status, Transport, clamp_seek};

const POSITION_INTERVAL: Duration = Duration::from_millis(50);
// A 5 ms idle wake is accepted: cheap, and bounds refill/tick latency.
const IDLE_WAIT: Duration = Duration::from_millis(5);
const CLEAR_TIMEOUT: Duration = Duration::from_millis(500);

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TrackInfo {
    pub title: String,
    pub path: PathBuf,
    pub codec: String,
    pub sample_rate: u32,
    pub channels: u16,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Snapshot {
    pub status: Status,
    pub position_ms: u64,
    pub duration_ms: Option<u64>,
    pub track: Option<TrackInfo>,
}

#[derive(Debug, Clone, PartialEq)]
pub enum PlayerEvent {
    State(Snapshot),
    Position { position_ms: u64 },
    /// `generation` is the `Player::generation` of the track that ended.
    Ended { generation: u64 },
    Error(PlayerError),
}


/// State shared between `Player` and the worker, behind a mutex.
struct Inner {
    transport: Transport,
    track: Option<TrackInfo>,
    /// Position (ms) that device frame 0 of the current play-out corresponds to.
    base_ms: u64,
    /// Device sample rate (0 until an output is opened).
    device_rate: u32,
    /// The decoder sits at EOF or after an error: `play` must rewind first.
    needs_rewind: bool,
    /// Bumped on every successful `load`; lets consumers discard a stale `Ended`.
    generation: u64,
}

impl Inner {
    fn snapshot(&self) -> Snapshot {
        Snapshot {
            status: self.transport.status,
            position_ms: self.transport.position_ms,
            duration_ms: self.transport.duration_ms,
            track: self.track.clone(),
        }
    }

    /// Bring the transport position up to date from the device frame counter.
    fn refresh(&mut self, frames_played: u64) {
        if self.transport.status == Status::Playing {
            let pos = position_ms(self.base_ms, frames_played, self.device_rate);
            self.transport.set_position(pos);
        }
    }
}

/// Poison-tolerant lock: a panicked holder must not take the player down too.
fn lock(m: &Mutex<Inner>) -> MutexGuard<'_, Inner> {
    m.lock().unwrap_or_else(|e| e.into_inner())
}

/// `base + frames / rate`, in ms, saturating.
pub(crate) fn position_ms(base_ms: u64, frames: u64, rate: u32) -> u64 {
    let rate = u128::from(rate.max(1));
    let ms = u128::from(frames) * 1000 / rate;
    base_ms.saturating_add(u64::try_from(ms).unwrap_or(u64::MAX))
}

/// Append `input` (interleaved, `in_ch` channels) to `out` as `out_ch` channels.
/// Mono -> every output channel; N -> 1 averages; otherwise copy the common
/// channels and zero the rest.
pub(crate) fn map_channels(input: &[f32], in_ch: usize, out_ch: usize, out: &mut Vec<f32>) {
    if in_ch == 0 || out_ch == 0 {
        return;
    }
    if in_ch == out_ch {
        out.extend_from_slice(input);
    } else if in_ch == 1 {
        for &s in input {
            out.extend(std::iter::repeat_n(s, out_ch));
        }
    } else if out_ch == 1 {
        let inv = 1.0 / in_ch as f32;
        out.extend(input.chunks_exact(in_ch).map(|f| f.iter().sum::<f32>() * inv));
    } else {
        let common = in_ch.min(out_ch);
        for frame in input.chunks_exact(in_ch) {
            out.extend_from_slice(&frame[..common]);
            out.extend(std::iter::repeat_n(0.0, out_ch - common));
        }
    }
}

enum Command {
    Load { decoder: Box<Decoder>, resampler: Resampler, reply: Sender<()> },
    Seek { ms: u64, reply: Sender<()> },
    Stop { reply: Sender<Result<(), PlayerError>> },
    Shutdown,
}

struct Worker {
    tx: Sender<Command>,
    join: Option<JoinHandle<()>>,
}

impl Worker {
    fn shutdown(&mut self) {
        let _ = self.tx.send(Command::Shutdown);
        if let Some(j) = self.join.take() {
            let _ = j.join();
        }
    }
}

pub struct Player {
    inner: Arc<Mutex<Inner>>,
    events: Sender<PlayerEvent>,
    /// Owned here (its stream may be `!Sync`); the worker uses `handle`.
    output: Option<Output>,
    handle: Option<OutputHandle>,
    worker: Option<Worker>,
    device_rate: u32,
    device_config: Option<OutputConfig>,
    /// UI sounds by name. Declared after `output` so it drops after the stream:
    /// the audio callback must never hold the last reference to a clip.
    sounds: HashMap<String, Sound>,
    /// Clips replaced by `load_sound` that the stream may still be playing.
    /// Declared after `output` so it drops after the stream; emptied only once
    /// the stream is gone. Never drop a clip handed to a live output elsewhere:
    /// the audio callback would then free it.
    retired: Vec<Clip>,
}

impl Player {
    /// Does not touch the audio device; that happens on the first `load`.
    pub fn new() -> (Player, Receiver<PlayerEvent>) {
        let (events, rx) = mpsc::channel();
        let inner = Inner {
            transport: Transport::new(),
            track: None,
            base_ms: 0,
            device_rate: 0,
            needs_rewind: false,
            generation: 0,
        };
        let player = Player {
            inner: Arc::new(Mutex::new(inner)),
            events,
            output: None,
            handle: None,
            worker: None,
            device_rate: 0,
            device_config: None,
            sounds: HashMap::new(),
            retired: Vec::new(),
        };
        (player, rx)
    }

    pub fn generation(&self) -> u64 {
        lock(&self.inner).generation
    }

    pub fn load(&mut self, path: &Path) -> Result<(), PlayerError> {
        // Everything fallible happens before any state is touched.
        let decoder = Decoder::open(path)?;
        self.ensure_output()?;
        let resampler =
            Resampler::new(decoder.sample_rate(), self.device_rate, decoder.channels())?;
        let info = decoder.track_info();
        let duration = decoder.duration_ms();
        if let Some(h) = &self.handle {
            h.set_playing(false);
        }
        // NOTE: writing track/duration here, before the worker acks, is deliberate (known, minor).
        // Track info/duration are installed by the worker under the lock, in
        // the same critical section as the frame-counter reset.
        {
            let mut g = lock(&self.inner);
            g.track = Some(info);
            g.transport.duration_ms = duration;
        }
        let (reply, wait) = mpsc::channel();
        self.send(Command::Load { decoder: Box::new(decoder), resampler, reply })?;
        wait.recv().map_err(|_| worker_gone())?;
        self.emit_state();
        Ok(())
    }

    pub fn play(&mut self) -> Result<(), PlayerError> {
        if lock(&self.inner).transport.status == Status::Empty {
            return lock(&self.inner).transport.play();
        }
        if self.handle.as_ref().is_none_or(OutputHandle::has_failed) {
            return Err(PlayerError::new(
                ErrorCode::NoOutputDevice,
                "audio output failed; load the track again",
            ));
        }
        loop {
            // The needs_rewind check and the transition to Playing share one
            // critical section, so the worker's end-of-track transition (which
            // also holds the lock) cannot slip in between and leave us
            // Playing with nothing feeding the ring. If it did end first, we
            // see needs_rewind and rewind, then re-check.
            let mut g = lock(&self.inner);
            if !g.needs_rewind {
                g.transport.play()?;
                break;
            }
            drop(g);
            self.rewind()?;
        }
        if let Some(h) = &self.handle {
            h.set_playing(true);
        }
        self.emit_state();
        Ok(())
    }

    pub fn pause(&mut self) -> Result<(), PlayerError> {
        // Stop the device first so the frame counter freezes, then capture the
        // position, then change state.
        if let Some(h) = &self.handle {
            h.set_playing(false);
        }
        let frames = self.handle.as_ref().map_or(0, OutputHandle::frames_played);
        {
            let mut g = lock(&self.inner);
            g.refresh(frames);
            g.transport.pause()?;
        }
        self.emit_state();
        Ok(())
    }

    pub fn stop(&mut self) -> Result<(), PlayerError> {
        if lock(&self.inner).transport.status == Status::Empty {
            self.emit_state();
            return Ok(());
        }
        self.rewind()?;
        self.emit_state();
        Ok(())
    }

    pub fn seek(&mut self, position_ms: u64) {
        let target = {
            let g = lock(&self.inner);
            if g.transport.status == Status::Empty {
                return;
            }
            clamp_seek(i64::try_from(position_ms).unwrap_or(i64::MAX), g.transport.duration_ms)
        };
        self.do_seek(target);
    }

    pub fn seek_relative(&mut self, delta_ms: i64) {
        let frames = self.handle.as_ref().map_or(0, OutputHandle::frames_played);
        let target = {
            let mut g = lock(&self.inner);
            if g.transport.status == Status::Empty {
                return;
            }
            g.refresh(frames);
            let cur = i64::try_from(g.transport.position_ms).unwrap_or(i64::MAX);
            clamp_seek(cur.saturating_add(delta_ms), g.transport.duration_ms)
        };
        self.do_seek(target);
    }

    /// Decode a short UI sound into memory under `name`, replacing any sound
    /// already there. Does not touch the audio device or the transport.
    pub fn load_sound(&mut self, name: &str, path: &Path) -> Result<(), PlayerError> {
        let sound = Sound::open(path)?;
        let mut sound = sound;
        // Convert now so the first key press does no resampling.
        if let Some(cfg) = self.device_config {
            let _ = sound.clip_for(cfg);
        }
        if let Some(old) = self.sounds.insert(name.to_owned(), sound)
            && let Some(clip) = old.into_clip()
        {
            // The old clip may still be playing; keep it until the stream is gone.
            self.retired.push(clip);
        }
        Ok(())
    }

    /// Mix a loaded sound on top of the music, in any state (also Empty). Opens
    /// the output if nothing has yet. Never changes the transport or emits events.
    pub fn play_sound(&mut self, name: &str) -> Result<(), PlayerError> {
        if !self.sounds.contains_key(name) {
            return Err(PlayerError::new(ErrorCode::InvalidState, format!("no sound named {name:?}")));
        }
        // With no track loaded a failed output can be reopened safely. Otherwise
        // only `load` reopens it (that resets the track); skip quietly.
        let empty = lock(&self.inner).transport.status == Status::Empty;
        if self.handle.is_none() || (empty && self.handle.as_ref().is_some_and(OutputHandle::has_failed)) {
            if self.handle.is_none() {
                self.ensure_output()?;
            } else {
                let _ = self.ensure_output();
            }
        }
        let (Some(output), Some(cfg)) = (self.output.as_mut(), self.device_config) else {
            return Ok(());
        };
        if output.has_failed() {
            return Ok(());
        }
        let Some(sound) = self.sounds.get_mut(name) else { return Ok(()) };
        let clip = sound.clip_for(cfg)?;
        output.play_clip(clip);
        Ok(())
    }

    pub fn snapshot(&self) -> Snapshot {
        let frames = self.handle.as_ref().map_or(0, OutputHandle::frames_played);
        let mut g = lock(&self.inner);
        g.refresh(frames);
        g.snapshot()
    }

    fn do_seek(&mut self, target: u64) {
        let (reply, wait) = mpsc::channel();
        if self.send(Command::Seek { ms: target, reply }).is_ok() {
            let _ = wait.recv();
        }
        self.emit_state();
    }

    /// Stop playback and rewind the decoder to 0 (also clears EOF/error state).
    fn rewind(&mut self) -> Result<(), PlayerError> {
        if let Some(h) = &self.handle {
            h.set_playing(false);
        }
        let (reply, wait) = mpsc::channel();
        self.send(Command::Stop { reply })?;
        let result = wait.recv().map_err(|_| worker_gone())?;
        if result.is_err() && lock(&self.inner).transport.status == Status::Playing {
            // The seek failed and the transport stayed Playing: un-silence the
            // output so the device matches the state.
            if let Some(h) = &self.handle {
                h.set_playing(true);
            }
        }
        result
    }

    fn send(&self, cmd: Command) -> Result<(), PlayerError> {
        match &self.worker {
            Some(w) => w.tx.send(cmd).map_err(|_| worker_gone()),
            None => Err(worker_gone()),
        }
    }

    fn emit_state(&self) {
        let snap = self.snapshot();
        let _ = self.events.send(PlayerEvent::State(snap));
    }

    /// Open the output (and its worker) on first use, or again after a failure.
    fn ensure_output(&mut self) -> Result<(), PlayerError> {
        if self.handle.as_ref().is_some_and(|h| !h.has_failed()) {
            return Ok(());
        }
        if let Some(mut w) = self.worker.take() {
            w.shutdown();
        }
        self.handle = None;
        self.output = None;
        // The old stream is gone, so these clips can be freed here.
        self.retired.clear();
        // Rate unknown before open: 96_000 frames is ~0.5 s at 192 kHz (more at lower rates); seek/stop use clear() so latency is unaffected.
        let (output, producer, cfg) = Output::open_default(96_000)?;
        let handle = output.handle();
        lock(&self.inner).device_rate = cfg.sample_rate;
        self.device_rate = cfg.sample_rate;
        self.device_config = Some(cfg);
        // Convert every sound to the new format now (the old stream is gone, so
        // replacing the old cached clips is safe) instead of on first key press.
        for sound in self.sounds.values_mut() {
            let _ = sound.clip_for(cfg);
        }
        let (tx, rx) = mpsc::channel();
        let mut worker = WorkerState {
            rx,
            events: self.events.clone(),
            inner: Arc::clone(&self.inner),
            handle: handle.clone(),
            producer,
            device_channels: usize::from(cfg.channels),
            dsp: DspChain::new(),
            track: None,
            dec_buf: Vec::new(),
            rs_buf: Vec::new(),
            pending: Vec::new(),
            pending_pos: 0,
            written_frames: 0,
            feeding: false,
            eof: false,
            last_position: Instant::now(),
            failure_reported: false,
        };
        let join = thread::Builder::new()
            .name("player-worker".into())
            .spawn(move || worker.run())
            .map_err(|e| PlayerError::new(ErrorCode::Internal, e.to_string()))?;
        self.output = Some(output);
        self.handle = Some(handle);
        self.worker = Some(Worker { tx, join: Some(join) });
        Ok(())
    }
}

impl Drop for Player {
    fn drop(&mut self) {
        if let Some(h) = &self.handle {
            h.set_playing(false);
        }
        if let Some(mut w) = self.worker.take() {
            w.shutdown();
        }
        // `output` drops afterwards (field order), once the worker is gone.
    }
}

fn worker_gone() -> PlayerError {
    PlayerError::new(ErrorCode::Internal, "player worker is not running")
}

struct Track {
    decoder: Box<Decoder>,
    resampler: Resampler,
    channels: usize,
    file_rate: u32,
}

struct WorkerState {
    rx: Receiver<Command>,
    events: Sender<PlayerEvent>,
    inner: Arc<Mutex<Inner>>,
    handle: OutputHandle,
    producer: rtrb::Producer<f32>,
    device_channels: usize,
    dsp: DspChain,
    track: Option<Track>,
    // Scratch buffers, allocated once and reused.
    dec_buf: Vec<f32>,
    rs_buf: Vec<f32>,
    /// Device-format samples decoded but not yet pushed (ring was full).
    pending: Vec<f32>,
    pending_pos: usize,
    /// Device frames pushed since the last frame-counter reset.
    written_frames: u64,
    /// Keep the ring topped up (a track is loaded and not finished/failed).
    feeding: bool,
    /// Decoder hit EOF and the resampler tail has been flushed into `pending`.
    eof: bool,
    last_position: Instant,
    failure_reported: bool,
}

impl WorkerState {
    fn run(&mut self) {
        loop {
            match self.rx.try_recv() {
                Ok(cmd) => {
                    if !self.handle_command(cmd) {
                        return;
                    }
                    continue;
                }
                Err(TryRecvError::Empty) => {}
                Err(TryRecvError::Disconnected) => return,
            }
            let progressed = self.pump();
            self.tick();
            if !progressed {
                // Ring full, paused with a full ring, or nothing to feed: wait
                // for a command, but wake every few ms to refill/tick. This is
                // not the realtime thread, so sleeping is fine.
                match self.rx.recv_timeout(IDLE_WAIT) {
                    Ok(cmd) => {
                        if !self.handle_command(cmd) {
                            return;
                        }
                    }
                    Err(RecvTimeoutError::Timeout) => {}
                    Err(RecvTimeoutError::Disconnected) => return,
                }
            }
        }
    }

    /// Returns false on shutdown.
    fn handle_command(&mut self, cmd: Command) -> bool {
        match cmd {
            Command::Load { decoder, resampler, reply } => {
                self.handle.set_playing(false);
                let channels = usize::from(decoder.channels());
                let file_rate = decoder.sample_rate();
                self.track = Some(Track { decoder, resampler, channels, file_rate });
                self.restart_at(0);
                lock(&self.inner).needs_rewind = false;
                // Transport: Empty/any -> Stopped at 0 (track info was set by Player).
                let mut g = lock(&self.inner);
                let dur = g.transport.duration_ms;
                g.transport.on_loaded(dur);
                // Bumped here, not in `Player::load`: `tick` reads track state and
                // generation under this same lock, so an Ended from the old track
                // can never be tagged with the new generation.
                g.generation += 1;
                drop(g);
                let _ = reply.send(());
            }
            Command::Seek { ms, reply } => {
                let result = self.track.as_mut().map(|t| t.decoder.seek(ms));
                match result {
                    Some(Ok(actual)) => {
                        self.restart_at(actual);
                        // The decoder is now positioned by this seek, so a later
                        // play() must resume here rather than rewind to 0.
                        lock(&self.inner).needs_rewind = false;
                    }
                    Some(Err(e)) => {
                        let _ = self.events.send(PlayerEvent::Error(e));
                    }
                    None => {}
                }
                let _ = reply.send(());
            }
            Command::Stop { reply } => {
                self.handle.set_playing(false);
                let result = match self.track.as_mut() {
                    Some(t) => t.decoder.seek(0).map(|_| ()),
                    None => Ok(()),
                };
                if result.is_ok() {
                    self.restart_at(0);
                    let mut g = lock(&self.inner);
                    g.transport.stop();
                    g.needs_rewind = false;
                }
                let _ = reply.send(result);
            }
            Command::Shutdown => return false,
        }
        true
    }

    /// Reset the pipeline so the next sample pushed is the one at `actual_ms`.
    fn restart_at(&mut self, actual_ms: u64) {
        if let Some(t) = self.track.as_mut() {
            t.resampler.reset();
        }
        self.pending.clear();
        self.pending_pos = 0;
        // Clear protocol (see Output::clear): request, wait for the callback's
        // ack, only then reset the counter and push. Bounded: if the stream is
        // dead or stalled we proceed anyway.
        self.handle.clear();
        let start = Instant::now();
        while self.handle.clear_pending()
            && !self.handle.has_failed()
            && start.elapsed() < CLEAR_TIMEOUT
        {
            thread::sleep(Duration::from_millis(1));
        }
        {
            // Base and counter change together under the lock so the control
            // side never computes a position from a mismatched pair.
            let mut g = lock(&self.inner);
            g.base_ms = actual_ms;
            g.transport.set_position(actual_ms);
            self.handle.reset_frames(0);
        }
        self.written_frames = 0;
        self.eof = false;
        self.feeding = self.track.is_some();
    }

    /// Push pending samples, else decode one more block. True if progress made.
    fn pump(&mut self) -> bool {
        if !self.feeding {
            return false;
        }
        if self.pending_pos < self.pending.len() {
            return self.push_pending();
        }
        if self.eof {
            return false;
        }
        let Some(t) = self.track.as_mut() else { return false };
        self.pending.clear();
        self.pending_pos = 0;
        self.rs_buf.clear();
        match t.decoder.next_block(&mut self.dec_buf) {
            Ok(true) => {
                // DSP runs at the file's rate and channel count, before resampling.
                self.dsp.process(&mut self.dec_buf, t.channels as u16, t.file_rate);
                t.resampler.process(&self.dec_buf, &mut self.rs_buf);
            }
            Ok(false) => {
                t.resampler.flush(&mut self.rs_buf);
                self.eof = true;
            }
            Err(e) => {
                self.fail(e);
                return true;
            }
        }
        if t.resampler.has_failed() {
            self.fail(PlayerError::new(ErrorCode::Internal, "resampler failed"));
            return true;
        }
        map_channels(&self.rs_buf, t.channels, self.device_channels, &mut self.pending);
        self.push_pending();
        true
    }

    fn push_pending(&mut self) -> bool {
        let ch = self.device_channels.max(1);
        let remaining = self.pending.len() - self.pending_pos;
        // Whole frames only, so the callback never sees a split frame.
        let n = remaining.min(self.producer.slots()) / ch * ch;
        if n == 0 {
            return false;
        }
        for &s in &self.pending[self.pending_pos..self.pending_pos + n] {
            // Cannot fail: `n <= slots()` and we are the only producer.
            let _ = self.producer.push(s);
        }
        self.pending_pos += n;
        self.written_frames += (n / ch) as u64;
        true
    }

    /// Position ticks, device-failure detection and end-of-track detection.
    fn tick(&mut self) {
        if self.handle.has_failed() && !self.failure_reported {
            self.failure_reported = true;
            if lock(&self.inner).transport.status != Status::Empty {
                self.fail(PlayerError::new(ErrorCode::NoOutputDevice, "audio output failed"));
            }
            return;
        }
        let frames = self.handle.frames_played();
        let mut g = lock(&self.inner);
        if g.transport.status != Status::Playing {
            return;
        }
        g.refresh(frames);
        let pos = g.transport.position_ms;
        let drained = self.feeding
            && self.eof
            && self.pending_pos >= self.pending.len()
            && frames >= self.written_frames;
        if drained {
            // Everything written has been played: the track is over. (Ended can fire slightly before device latency drains; accepted.)
            self.feeding = false;
            self.handle.set_playing(false);
            g.transport.on_ended();
            g.needs_rewind = true;
            let snap = g.snapshot();
            let generation = g.generation;
            drop(g);
            let _ = self.events.send(PlayerEvent::Ended { generation });
            let _ = self.events.send(PlayerEvent::State(snap));
        } else if self.last_position.elapsed() >= POSITION_INTERVAL {
            drop(g);
            self.last_position = Instant::now();
            let _ = self.events.send(PlayerEvent::Position { position_ms: pos });
        }
    }

    /// Asynchronous failure: report, stop feeding, move the transport to Stopped.
    fn fail(&mut self, err: PlayerError) {
        self.handle.set_playing(false);
        self.feeding = false;
        // Error is sent before the State event; sidecar relies on this order.
        let _ = self.events.send(PlayerEvent::Error(err));
        let mut g = lock(&self.inner);
        g.transport.stop();
        g.needs_rewind = true;
        let snap = g.snapshot();
        drop(g);
        let _ = self.events.send(PlayerEvent::State(snap));
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn mono_to_stereo_duplicates() {
        let mut out = Vec::new();
        map_channels(&[0.1, 0.2], 1, 2, &mut out);
        assert_eq!(out, [0.1, 0.1, 0.2, 0.2]);
    }

    #[test]
    fn stereo_to_mono_averages() {
        let mut out = Vec::new();
        map_channels(&[0.2, 0.4, 1.0, 0.0], 2, 1, &mut out);
        assert_eq!(out.len(), 2);
        assert!((out[0] - 0.3).abs() < 1e-6 && (out[1] - 0.5).abs() < 1e-6);
    }

    #[test]
    fn six_to_two_copies_first_two() {
        let mut out = Vec::new();
        map_channels(&[1., 2., 3., 4., 5., 6., 7., 8., 9., 10., 11., 12.], 6, 2, &mut out);
        assert_eq!(out, [1., 2., 7., 8.]);
    }

    #[test]
    fn two_to_six_zero_fills() {
        let mut out = Vec::new();
        map_channels(&[1., 2.], 2, 6, &mut out);
        assert_eq!(out, [1., 2., 0., 0., 0., 0.]);
    }

    #[test]
    fn same_channels_passthrough() {
        let mut out = Vec::new();
        map_channels(&[1., 2.], 2, 2, &mut out);
        assert_eq!(out, [1., 2.]);
    }

    #[test]
    fn position_math() {
        assert_eq!(position_ms(0, 48_000, 48_000), 1000);
        assert_eq!(position_ms(2500, 24_000, 48_000), 3000);
        assert_eq!(position_ms(0, 441, 44_100), 10);
        assert_eq!(position_ms(5, 0, 0), 5);
    }
}
