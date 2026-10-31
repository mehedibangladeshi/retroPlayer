//! cpal output stream fed by a lock-free ring buffer. STUB: task 2.2 implements it.

use crate::error::PlayerError;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct OutputConfig {
    pub sample_rate: u32,
    pub channels: u16,
}

pub struct Output {}

impl Output {
    pub fn open_default(
        _capacity_frames: usize,
    ) -> Result<(Output, rtrb::Producer<f32>, OutputConfig), PlayerError> {
        todo!("task 2.2")
    }
    pub fn set_playing(&self, _playing: bool) {
        todo!("task 2.2")
    }
    pub fn clear(&self) {
        todo!("task 2.2")
    }
    pub fn frames_played(&self) -> u64 {
        todo!("task 2.2")
    }
    pub fn reset_frames(&self, _frames: u64) {
        todo!("task 2.2")
    }
}
