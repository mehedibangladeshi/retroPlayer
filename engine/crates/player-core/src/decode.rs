//! Symphonia-based decoder: opens a file, yields interleaved f32 blocks, seeks.

use std::fs::File;
use std::io::ErrorKind;
use std::path::{Path, PathBuf};

use symphonia::core::codecs::audio::{AudioDecoder, AudioDecoderOptions};
use symphonia::core::errors::{Error as SymError, SeekErrorKind};
use symphonia::core::formats::probe::Hint;
use symphonia::core::formats::{FormatOptions, FormatReader, SeekMode, SeekTo, TrackType};
use symphonia::core::io::MediaSourceStream;
use symphonia::core::meta::{MetadataOptions, StandardTag};
use symphonia::core::units::{Time, Timestamp};

use crate::error::{ErrorCode, PlayerError};
use crate::player::TrackInfo;

const MAX_SEEK_MS: u64 = 24 * 60 * 60 * 1000;

pub struct Decoder {
    format: Box<dyn FormatReader>,
    decoder: Box<dyn AudioDecoder>,
    track_id: u32,
    info: TrackInfo,
    duration_ms: Option<u64>,
}

fn err(code: ErrorCode, msg: impl Into<String>) -> PlayerError {
    PlayerError::new(code, msg)
}

fn unsupported(e: SymError) -> PlayerError {
    err(ErrorCode::UnsupportedFormat, e.to_string())
}

fn decode_err(e: SymError) -> PlayerError {
    err(ErrorCode::DecodeError, e.to_string())
}

fn time_to_ms(t: Time) -> u64 {
    u64::try_from(t.as_millis()).unwrap_or(0)
}

impl Decoder {
    pub fn open(path: &Path) -> Result<Self, PlayerError> {
        let file = File::open(path).map_err(|e| match e.kind() {
            ErrorKind::NotFound => {
                err(ErrorCode::FileNotFound, format!("{}: not found", path.display()))
            }
            _ => err(ErrorCode::Internal, format!("{}: {e}", path.display())),
        })?;
        if file.metadata().map(|m| m.is_dir()).unwrap_or(false) {
            return Err(err(ErrorCode::UnsupportedFormat, "path is a directory"));
        }

        let mss = MediaSourceStream::new(Box::new(file), Default::default());
        let mut hint = Hint::new();
        if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
            hint.with_extension(ext);
        }

        let mut format = symphonia::default::get_probe()
            .probe(&hint, mss, FormatOptions::default(), MetadataOptions::default())
            .map_err(unsupported)?;

        let track = format
            .default_track(TrackType::Audio)
            .ok_or_else(|| err(ErrorCode::UnsupportedFormat, "no audio track"))?;
        let track_id = track.id;
        let params = track
            .codec_params
            .as_ref()
            .and_then(|p| p.audio())
            .ok_or_else(|| err(ErrorCode::UnsupportedFormat, "no audio codec parameters"))?
            .clone();

        let codec_name = symphonia::default::get_codecs()
            .get_audio_decoder(params.codec)
            .map(|d| d.codec.info.short_name.to_ascii_lowercase())
            .unwrap_or_else(|| "unknown".to_string());

        let sample_rate = params
            .sample_rate
            .filter(|r| *r > 0)
            .ok_or_else(|| err(ErrorCode::UnsupportedFormat, "unknown sample rate"))?;
        let channels = params
            .channels
            .as_ref()
            .map(|c| c.count())
            .filter(|c| *c > 0)
            .and_then(|c| u16::try_from(c).ok())
            .ok_or_else(|| err(ErrorCode::UnsupportedFormat, "unknown channel layout"))?;

        // Duration: prefer the playable frame count, else container duration * time base.
        let duration_ms = track
            .num_frames
            .map(|n| n.saturating_mul(1000) / u64::from(sample_rate))
            .or_else(|| {
                let (dur, tb) = (track.duration?, track.time_base?);
                tb.calc_duration(dur).map(time_to_ms)
            });

        let decoder = symphonia::default::get_codecs()
            .make_audio_decoder(&params, &AudioDecoderOptions::default())
            .map_err(unsupported)?;

        let stem = path
            .file_stem()
            .map(|s| s.to_string_lossy().into_owned())
            .unwrap_or_default();
        let title = format
            .metadata()
            .skip_to_latest()
            .and_then(|rev| {
                rev.media.tags.iter().find_map(|t| match &t.std {
                    Some(StandardTag::TrackTitle(s)) if !s.trim().is_empty() => {
                        Some(s.trim().to_string())
                    }
                    _ => None,
                })
            })
            .unwrap_or(stem);

        Ok(Self {
            format,
            decoder,
            track_id,
            info: TrackInfo {
                title,
                path: PathBuf::from(path),
                codec: codec_name,
                sample_rate,
                channels,
            },
            duration_ms,
        })
    }

    pub fn track_info(&self) -> TrackInfo {
        self.info.clone()
    }

    pub fn duration_ms(&self) -> Option<u64> {
        self.duration_ms
    }

    pub fn sample_rate(&self) -> u32 {
        self.info.sample_rate
    }

    pub fn channels(&self) -> u16 {
        self.info.channels
    }

    /// Clears `out` and fills it with the interleaved f32 samples of one decoded packet.
    /// `Ok(false)` means end of stream. The vector's capacity is reused between calls.
    pub fn next_block(&mut self, out: &mut Vec<f32>) -> Result<bool, PlayerError> {
        out.clear();
        loop {
            let packet = match self.format.next_packet() {
                Ok(Some(p)) => p,
                Ok(None) => return Ok(false),
                Err(SymError::IoError(e)) if e.kind() == ErrorKind::UnexpectedEof => {
                    return Ok(false);
                }
                // Track list changed (chained streams): re-select the track and carry on.
                Err(SymError::ResetRequired) => {
                    self.recreate_decoder()?;
                    continue;
                }
                Err(e) => return Err(decode_err(e)),
            };
            if packet.track_id != self.track_id {
                continue;
            }
            match self.decoder.decode(&packet) {
                Ok(buf) => {
                    buf.copy_to_vec_interleaved::<f32>(out);
                    if out.is_empty() {
                        continue;
                    }
                    return Ok(true);
                }
                // Corrupt packet: skip it and keep going.
                Err(SymError::DecodeError(_)) => continue,
                Err(SymError::IoError(e)) if e.kind() == ErrorKind::UnexpectedEof => {
                    return Ok(false);
                }
                Err(SymError::ResetRequired) => {
                    self.recreate_decoder()?;
                    continue;
                }
                Err(e) => return Err(decode_err(e)),
            }
        }
    }

    /// Accurate seek; returns the position actually reached in ms (at or before the target).
    pub fn seek(&mut self, position_ms: u64) -> Result<u64, PlayerError> {
        let target_ms = match self.duration_ms {
            Some(d) => position_ms.min(d),
            None => position_ms,
        };
        // Unknown duration: keep the target sane (24 h) rather than handing symphonia a huge value.
        let ms_i64 = i64::try_from(target_ms.min(MAX_SEEK_MS)).unwrap_or(0);
        let mut result = self.format.seek(
            SeekMode::Accurate,
            SeekTo::Time { time: Time::from_millis(ms_i64), track_id: Some(self.track_id) },
        );
        // Seeking exactly onto the end can be rejected by some readers; back off a little.
        if matches!(result, Err(SymError::SeekError(SeekErrorKind::OutOfRange))) && target_ms > 0 {
            let back = Time::from_millis(ms_i64.saturating_sub(1));
            result = self.format.seek(
                SeekMode::Accurate,
                SeekTo::Time { time: back, track_id: Some(self.track_id) },
            );
        }
        let seeked = result.map_err(decode_err)?;
        self.decoder.reset();

        let ms = self
            .format
            .tracks()
            .iter()
            .find(|t| t.id == self.track_id)
            .and_then(|t| t.time_base)
            .and_then(|tb| tb.calc_time(seeked.actual_ts))
            .map(time_to_ms)
            .unwrap_or_else(|| ts_to_ms(seeked.actual_ts, self.info.sample_rate));
        Ok(ms)
    }

    /// Re-selects the default audio track and rebuilds the codec decoder for it.
    fn recreate_decoder(&mut self) -> Result<(), PlayerError> {
        let track = self
            .format
            .default_track(TrackType::Audio)
            .ok_or_else(|| err(ErrorCode::DecodeError, "no audio track after reset"))?;
        let params = track
            .codec_params
            .as_ref()
            .and_then(|p| p.audio())
            .ok_or_else(|| err(ErrorCode::DecodeError, "no audio codec parameters after reset"))?;
        let decoder = symphonia::default::get_codecs()
            .make_audio_decoder(params, &AudioDecoderOptions::default())
            .map_err(decode_err)?;
        self.track_id = track.id;
        self.decoder = decoder;
        Ok(())
    }
}

/// Fallback when the track has no time base: assume timestamps count frames.
fn ts_to_ms(ts: Timestamp, sample_rate: u32) -> u64 {
    u64::try_from(ts.get()).unwrap_or(0).saturating_mul(1000) / u64::from(sample_rate)
}

