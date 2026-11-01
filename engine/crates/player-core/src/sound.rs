//! Short UI sounds (key clicks): decoded fully into memory once, converted to
//! the output device's format on first use, then mixed by the output callback.

use std::path::Path;
use std::sync::Arc;

use crate::decode::Decoder;
use crate::error::{ErrorCode, PlayerError};
use crate::output::{Clip, OutputConfig};
use crate::player::map_channels;
use crate::resample::Resampler;

/// Longer files are cut here: these are key sounds, not music.
const MAX_SOUND_MS: u64 = 10_000;

pub struct Sound {
    rate: u32,
    channels: u16,
    /// Interleaved f32 at the file's rate and channel count.
    samples: Vec<f32>,
    /// The samples converted for one device format.
    cached: Option<(OutputConfig, Clip)>,
}

impl Sound {
    pub fn open(path: &Path) -> Result<Self, PlayerError> {
        let mut decoder = Decoder::open(path)?;
        let rate = decoder.sample_rate();
        let channels = decoder.channels();
        let max = MAX_SOUND_MS as usize * rate as usize / 1000 * usize::from(channels);
        let mut samples = Vec::new();
        let mut block = Vec::new();
        while samples.len() < max && decoder.next_block(&mut block)? {
            samples.extend_from_slice(&block);
        }
        samples.truncate(max);
        Ok(Sound { rate, channels, samples, cached: None })
    }

    /// Give up the cached clip so the caller can retire it safely.
    pub(crate) fn into_clip(self) -> Option<Clip> {
        self.cached.map(|(_, clip)| clip)
    }

    /// The sound in `cfg`'s format, converted once per device format.
    pub(crate) fn clip_for(&mut self, cfg: OutputConfig) -> Result<Clip, PlayerError> {
        if let Some((c, clip)) = &self.cached
            && *c == cfg
        {
            return Ok(Arc::clone(clip));
        }
        let mut resampled = Vec::new();
        let mut rs = Resampler::new(self.rate, cfg.sample_rate, self.channels)?;
        rs.process(&self.samples, &mut resampled);
        rs.flush(&mut resampled);
        if rs.has_failed() {
            return Err(PlayerError::new(ErrorCode::Internal, "sound could not be resampled"));
        }
        let mut out = Vec::with_capacity(resampled.len());
        map_channels(&resampled, usize::from(self.channels), usize::from(cfg.channels), &mut out);
        let clip: Clip = out.into();
        self.cached = Some((cfg, Arc::clone(&clip)));
        Ok(clip)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn fixture() -> PathBuf {
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("tests/fixtures/sine_440hz_250ms_44100_mono.wav")
    }

    #[test]
    fn decodes_whole_file_into_memory() {
        let s = Sound::open(&fixture()).unwrap();
        assert_eq!((s.rate, s.channels), (44_100, 1));
        assert_eq!(s.samples.len(), 11_025);
    }

    #[test]
    fn converts_to_device_format_and_caches() {
        let mut s = Sound::open(&fixture()).unwrap();
        let cfg = OutputConfig { sample_rate: 48_000, channels: 2 };
        let clip = s.clip_for(cfg).unwrap();
        // 250 ms at 48 kHz stereo, give or take the resampler's edges.
        let frames = clip.len() / 2;
        assert!((11_900..=12_100).contains(&frames), "got {frames} frames");
        assert!(Arc::ptr_eq(&clip, &s.clip_for(cfg).unwrap()));
        let same = OutputConfig { sample_rate: 44_100, channels: 1 };
        assert_eq!(s.clip_for(same).unwrap().len(), 11_025);
    }

    #[test]
    fn missing_file_is_an_error() {
        let e = Sound::open(Path::new("/nonexistent/click.mp3")).err().unwrap();
        assert_eq!(e.code, ErrorCode::FileNotFound);
    }
}
