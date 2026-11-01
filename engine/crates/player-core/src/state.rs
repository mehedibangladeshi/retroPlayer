//! Transport state machine: pure logic, no I/O. The player drives it and
//! reports its state to the UI; keeping it pure makes every transition testable.

use crate::error::{ErrorCode, PlayerError};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Status {
    Empty,
    Stopped,
    Playing,
    Paused,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Transport {
    pub status: Status,
    pub position_ms: u64,
    pub duration_ms: Option<u64>,
}

impl Default for Transport {
    fn default() -> Self {
        Self::new()
    }
}

impl Transport {
    pub fn new() -> Self {
        Self { status: Status::Empty, position_ms: 0, duration_ms: None }
    }

    pub fn on_loaded(&mut self, duration_ms: Option<u64>) {
        self.status = Status::Stopped;
        self.position_ms = 0;
        self.duration_ms = duration_ms;
    }

    pub fn play(&mut self) -> Result<(), PlayerError> {
        match self.status {
            Status::Empty => Err(invalid("cannot play: no track loaded")),
            _ => {
                self.status = Status::Playing;
                Ok(())
            }
        }
    }

    pub fn pause(&mut self) -> Result<(), PlayerError> {
        match self.status {
            Status::Playing | Status::Paused => {
                self.status = Status::Paused;
                Ok(())
            }
            Status::Empty => Err(invalid("cannot pause: no track loaded")),
            Status::Stopped => Err(invalid("cannot pause: track is stopped")),
        }
    }

    pub fn stop(&mut self) {
        if self.status != Status::Empty {
            self.status = Status::Stopped;
            self.position_ms = 0;
        }
    }

    pub fn set_position(&mut self, position_ms: u64) {
        self.position_ms = match self.duration_ms {
            Some(d) => position_ms.min(d),
            None => position_ms,
        };
    }

    pub fn on_ended(&mut self) {
        self.status = Status::Stopped;
        self.position_ms = 0;
    }
}

fn invalid(msg: &str) -> PlayerError {
    PlayerError::new(ErrorCode::InvalidState, msg)
}

/// Clamp to `[0, duration]`; an unknown duration only clamps at zero.
pub fn clamp_seek(target_ms: i64, duration_ms: Option<u64>) -> u64 {
    let t = target_ms.max(0) as u64;
    match duration_ms {
        Some(d) => t.min(d),
        None => t,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn loaded(duration: Option<u64>) -> Transport {
        let mut t = Transport::new();
        t.on_loaded(duration);
        t
    }

    fn is_invalid<T: std::fmt::Debug>(r: Result<T, PlayerError>) -> bool {
        matches!(r, Err(e) if e.code == ErrorCode::InvalidState)
    }

    #[test]
    fn new_is_empty() {
        let t = Transport::new();
        assert_eq!((t.status, t.position_ms, t.duration_ms), (Status::Empty, 0, None));
        assert_eq!(Transport::default(), t);
    }

    #[test]
    fn on_loaded_goes_stopped() {
        let t = loaded(Some(1000));
        assert_eq!((t.status, t.position_ms, t.duration_ms), (Status::Stopped, 0, Some(1000)));
    }

    #[test]
    fn load_from_playing_resets() {
        let mut t = loaded(Some(1000));
        t.play().unwrap();
        t.set_position(500);
        t.on_loaded(Some(2000));
        assert_eq!((t.status, t.position_ms, t.duration_ms), (Status::Stopped, 0, Some(2000)));
    }

    #[test]
    fn play_transitions() {
        let mut t = Transport::new();
        assert!(is_invalid(t.play()));
        assert_eq!(t.status, Status::Empty);
        t.on_loaded(None);
        assert!(t.play().is_ok());
        assert_eq!(t.status, Status::Playing);
        assert!(t.play().is_ok());
        assert_eq!(t.status, Status::Playing);
        t.pause().unwrap();
        assert!(t.play().is_ok());
        assert_eq!(t.status, Status::Playing);
    }

    #[test]
    fn pause_transitions() {
        let mut t = Transport::new();
        assert!(is_invalid(t.pause()));
        t.on_loaded(None);
        assert!(is_invalid(t.pause()));
        assert_eq!(t.status, Status::Stopped);
        t.play().unwrap();
        assert!(t.pause().is_ok());
        assert_eq!(t.status, Status::Paused);
        assert!(t.pause().is_ok());
        assert_eq!(t.status, Status::Paused);
    }

    #[test]
    fn stop_transitions() {
        let mut t = Transport::new();
        t.stop();
        assert_eq!(t.status, Status::Empty);
        t.on_loaded(Some(1000));
        t.play().unwrap();
        t.set_position(400);
        t.stop();
        assert_eq!((t.status, t.position_ms), (Status::Stopped, 0));
        t.play().unwrap();
        t.set_position(100);
        t.pause().unwrap();
        t.stop();
        assert_eq!((t.status, t.position_ms), (Status::Stopped, 0));
        t.stop();
        assert_eq!((t.status, t.position_ms), (Status::Stopped, 0));
    }

    #[test]
    fn on_ended_stops_and_resets() {
        let mut t = loaded(Some(1000));
        t.play().unwrap();
        t.set_position(999);
        t.on_ended();
        assert_eq!((t.status, t.position_ms), (Status::Stopped, 0));
    }

    #[test]
    fn clamp_seek_cases() {
        assert_eq!(clamp_seek(-5, Some(100)), 0);
        assert_eq!(clamp_seek(-5, None), 0);
        assert_eq!(clamp_seek(500, Some(100)), 100);
        assert_eq!(clamp_seek(500, None), 500);
        assert_eq!(clamp_seek(0, Some(100)), 0);
        assert_eq!(clamp_seek(100, Some(100)), 100);
        assert_eq!(clamp_seek(50, Some(100)), 50);
    }

    #[test]
    fn set_position_clamps() {
        let mut t = loaded(Some(100));
        t.set_position(250);
        assert_eq!(t.position_ms, 100);
    }

    #[test]
    fn set_position_keeps_status_and_unknown_duration_is_unbounded() {
        let mut t = loaded(Some(1000));
        t.play().unwrap();
        t.set_position(400);
        assert_eq!((t.status, t.position_ms), (Status::Playing, 400));
        t.set_position(5000);
        assert_eq!((t.status, t.position_ms), (Status::Playing, 1000));
        t.pause().unwrap();
        t.set_position(10);
        assert_eq!((t.status, t.position_ms), (Status::Paused, 10));

        let mut unknown = loaded(None);
        unknown.set_position(5000);
        assert_eq!(unknown.position_ms, 5000);
    }
}
