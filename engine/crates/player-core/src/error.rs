//! Error type shared across the engine.

use std::fmt;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ErrorCode {
    UnsupportedFormat,
    FileNotFound,
    NoOutputDevice,
    DecodeError,
    InvalidState,
    Internal,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PlayerError {
    pub code: ErrorCode,
    pub message: String,
}

impl PlayerError {
    pub fn new(code: ErrorCode, message: impl Into<String>) -> Self {
        Self { code, message: message.into() }
    }
}

impl fmt::Display for PlayerError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{:?}: {}", self.code, self.message)
    }
}

impl std::error::Error for PlayerError {}
