//! Pure audio engine library: decode, DSP chain, output and transport state.
//! No stdio and no UI concepts live here.

pub mod decode;
pub mod dsp;
pub mod error;
pub mod output;
pub mod player;
pub mod resample;
pub mod state;

pub use decode::Decoder;
pub use dsp::{DspChain, DspStage};
pub use error::{ErrorCode, PlayerError};
pub use output::{Output, OutputConfig};
pub use player::{Player, PlayerEvent, Snapshot, TrackInfo};
pub use resample::Resampler;
pub use state::{Status, Transport, clamp_seek};
