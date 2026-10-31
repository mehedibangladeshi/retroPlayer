//! Rubato-based sample-rate converter. STUB: task 2.1 implements it.

use crate::error::PlayerError;

pub struct Resampler {}

impl Resampler {
    pub fn new(_in_rate: u32, _out_rate: u32, _channels: u16) -> Result<Self, PlayerError> {
        todo!("task 2.1")
    }
    pub fn process(&mut self, _input: &[f32], _out: &mut Vec<f32>) {
        todo!("task 2.1")
    }
    pub fn flush(&mut self, _out: &mut Vec<f32>) {
        todo!("task 2.1")
    }
}
