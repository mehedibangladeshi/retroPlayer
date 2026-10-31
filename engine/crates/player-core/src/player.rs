//! Public player types. `TrackInfo`, `Snapshot` and `PlayerEvent` are real;
//! `Player` is a STUB that task 3.1 implements.

use std::path::{Path, PathBuf};
use std::sync::mpsc::Receiver;

use crate::error::PlayerError;
use crate::state::Status;

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
    Ended,
    Error(PlayerError),
}

pub struct Player {}

impl Player {
    pub fn new() -> (Player, Receiver<PlayerEvent>) {
        todo!("task 3.1")
    }
    pub fn load(&mut self, _path: &Path) -> Result<(), PlayerError> {
        todo!("task 3.1")
    }
    pub fn play(&mut self) -> Result<(), PlayerError> {
        todo!("task 3.1")
    }
    pub fn pause(&mut self) -> Result<(), PlayerError> {
        todo!("task 3.1")
    }
    pub fn stop(&mut self) -> Result<(), PlayerError> {
        todo!("task 3.1")
    }
    pub fn seek(&mut self, _position_ms: u64) {
        todo!("task 3.1")
    }
    pub fn seek_relative(&mut self, _delta_ms: i64) {
        todo!("task 3.1")
    }
    pub fn snapshot(&self) -> Snapshot {
        todo!("task 3.1")
    }
}
