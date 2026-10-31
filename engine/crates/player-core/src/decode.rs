//! Symphonia-based decoder. STUB: task 2.1 implements it.

use crate::error::PlayerError;
use crate::player::TrackInfo;

pub struct Decoder {
    _private: (),
}

impl Decoder {
    pub fn open(_path: &std::path::Path) -> Result<Self, PlayerError> {
        todo!("task 2.1")
    }
    pub fn track_info(&self) -> TrackInfo {
        todo!("task 2.1")
    }
    pub fn duration_ms(&self) -> Option<u64> {
        todo!("task 2.1")
    }
    pub fn sample_rate(&self) -> u32 {
        todo!("task 2.1")
    }
    pub fn channels(&self) -> u16 {
        todo!("task 2.1")
    }
    /// Appends interleaved f32 samples; `Ok(false)` means end of stream.
    pub fn next_block(&mut self, _out: &mut Vec<f32>) -> Result<bool, PlayerError> {
        todo!("task 2.1")
    }
    pub fn seek(&mut self, _position_ms: u64) -> Result<u64, PlayerError> {
        todo!("task 2.1")
    }
}
