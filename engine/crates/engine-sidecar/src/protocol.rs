//! Wire types for the NDJSON protocol described in docs/PROTOCOL.md.

use player_core::{ErrorCode, PlayerError, PlayerEvent, Snapshot, Status, TrackInfo};
use serde::{Deserialize, Serialize};
use serde_json::Value;

pub const VERSION: u64 = 1;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum Command {
    #[serde(rename_all = "camelCase")]
    Load { path: String },
    Play,
    Pause,
    Stop,
    #[serde(rename_all = "camelCase")]
    Seek {
        #[serde(deserialize_with = "lenient_position")]
        position_ms: u64,
    },
    #[serde(rename_all = "camelCase")]
    SeekRelative {
        #[serde(deserialize_with = "lenient_delta")]
        delta_ms: i64,
    },
    LoadSound { name: String, path: String },
    PlaySound { name: String },
}

/// Commands accept any JSON number for millisecond fields and round to the
/// nearest integer (halves away from zero); output stays integer-typed.
fn lenient_delta<'de, D: serde::Deserializer<'de>>(d: D) -> Result<i64, D::Error> {
    // `as` saturates for out-of-range floats.
    Ok(f64::deserialize(d)?.round() as i64)
}

/// Like `lenient_delta`, but negative positions become 0.
fn lenient_position<'de, D: serde::Deserializer<'de>>(d: D) -> Result<u64, D::Error> {
    Ok(f64::deserialize(d)?.round().max(0.0) as u64)
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum WireStatus {
    Empty,
    Stopped,
    Playing,
    Paused,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WireTrackInfo {
    pub title: String,
    pub path: String,
    pub codec: String,
    pub sample_rate: u32,
    pub channels: u16,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum WireErrorCode {
    UnsupportedFormat,
    FileNotFound,
    NoOutputDevice,
    DecodeError,
    InvalidState,
    BadMessage,
    Internal,
    /// Only the Electron main process emits this; listed so the type accepts it.
    EngineCrashed,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum Event {
    #[serde(rename_all = "camelCase")]
    State {
        status: WireStatus,
        position_ms: u64,
        duration_ms: Option<u64>,
        track_info: Option<WireTrackInfo>,
    },
    #[serde(rename_all = "camelCase")]
    Position { position_ms: u64 },
    Ended,
    Error { code: WireErrorCode, message: String },
}

impl Event {
    pub fn bad_message(message: impl Into<String>) -> Event {
        Event::Error { code: WireErrorCode::BadMessage, message: message.into() }
    }

    /// Serialize as one line (no trailing newline) with the `"v":1` envelope.
    pub fn to_line(&self) -> String {
        #[derive(Serialize)]
        struct Envelope<'a> {
            v: u64,
            #[serde(flatten)]
            event: &'a Event,
        }
        serde_json::to_string(&Envelope { v: VERSION, event: self })
            .unwrap_or_else(|_| r#"{"v":1,"type":"error","code":"internal","message":"serialize failed"}"#.into())
    }
}

fn parse_versioned<T: serde::de::DeserializeOwned>(line: &str) -> Result<T, String> {
    let value: Value = serde_json::from_str(line).map_err(|e| format!("invalid JSON: {e}"))?;
    match value.get("v") {
        Some(v) if v.as_u64() == Some(VERSION) => {}
        Some(v) => return Err(format!("unsupported protocol version: {v}")),
        None => return Err("missing field `v`".into()),
    }
    serde_json::from_value(value).map_err(|e| format!("invalid message: {e}"))
}

pub fn parse_command(line: &str) -> Result<Command, String> {
    parse_versioned(line)
}

#[cfg(test)]
fn parse_event(line: &str) -> Result<Event, String> {
    parse_versioned(line)
}

impl From<Status> for WireStatus {
    fn from(s: Status) -> Self {
        match s {
            Status::Empty => WireStatus::Empty,
            Status::Stopped => WireStatus::Stopped,
            Status::Playing => WireStatus::Playing,
            Status::Paused => WireStatus::Paused,
        }
    }
}

impl From<ErrorCode> for WireErrorCode {
    fn from(c: ErrorCode) -> Self {
        match c {
            ErrorCode::UnsupportedFormat => WireErrorCode::UnsupportedFormat,
            ErrorCode::FileNotFound => WireErrorCode::FileNotFound,
            ErrorCode::NoOutputDevice => WireErrorCode::NoOutputDevice,
            ErrorCode::DecodeError => WireErrorCode::DecodeError,
            ErrorCode::InvalidState => WireErrorCode::InvalidState,
            ErrorCode::Internal => WireErrorCode::Internal,
        }
    }
}

impl From<TrackInfo> for WireTrackInfo {
    fn from(t: TrackInfo) -> Self {
        WireTrackInfo {
            title: t.title,
            path: t.path.to_string_lossy().into_owned(),
            codec: t.codec,
            sample_rate: t.sample_rate,
            channels: t.channels,
        }
    }
}

impl From<Snapshot> for Event {
    fn from(s: Snapshot) -> Self {
        Event::State {
            status: s.status.into(),
            position_ms: s.position_ms,
            duration_ms: s.duration_ms,
            track_info: s.track.map(Into::into),
        }
    }
}

impl From<PlayerError> for Event {
    fn from(e: PlayerError) -> Self {
        Event::Error { code: e.code.into(), message: e.message }
    }
}

impl From<PlayerEvent> for Event {
    fn from(e: PlayerEvent) -> Self {
        match e {
            PlayerEvent::State(s) => s.into(),
            PlayerEvent::Position { position_ms } => Event::Position { position_ms },
            PlayerEvent::Ended => Event::Ended,
            PlayerEvent::Error(e) => e.into(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const DOC: &str = include_str!(concat!(env!("CARGO_MANIFEST_DIR"), "/../../../docs/PROTOCOL.md"));

    fn json_blocks() -> Vec<String> {
        let mut out = Vec::new();
        let mut cur: Option<Vec<&str>> = None;
        for line in DOC.lines() {
            match (&mut cur, line.trim()) {
                (None, "```json") => cur = Some(Vec::new()),
                (Some(buf), "```") => {
                    out.push(buf.join("\n"));
                    cur = None;
                }
                (Some(buf), _) => buf.push(line),
                _ => {}
            }
        }
        out
    }

    #[test]
    fn every_doc_example_round_trips() {
        let blocks = json_blocks();
        assert!(blocks.len() >= 10, "found only {} examples", blocks.len());
        for block in blocks {
            assert_eq!(block.lines().count(), 1, "example must be one line: {block}");
            let original: Value = serde_json::from_str(&block).unwrap();
            let again: Value = if let Ok(cmd) = parse_command(&block) {
                let mut v = serde_json::to_value(&cmd).unwrap();
                v["v"] = VERSION.into();
                v
            } else if let Ok(ev) = parse_event(&block) {
                serde_json::from_str(&ev.to_line()).unwrap()
            } else {
                panic!("example parses as neither Command nor Event: {block}");
            };
            assert_eq!(original, again, "round trip mismatch for {block}");
        }
    }

    #[test]
    fn wrong_version_rejected() {
        assert!(parse_command(r#"{"v":2,"type":"play"}"#).is_err());
        assert!(parse_command(r#"{"type":"play"}"#).is_err());
        assert!(parse_command(r#"{"v":"1","type":"play"}"#).is_err());
    }

    #[test]
    fn unknown_type_rejected() {
        assert!(parse_command(r#"{"v":1,"type":"explode"}"#).is_err());
        assert!(parse_command(r#"{"v":1}"#).is_err());
    }

    #[test]
    fn malformed_and_missing_fields_rejected() {
        assert!(parse_command("not json").is_err());
        assert!(parse_command(r#"{"v":1,"type":"load"}"#).is_err());
        assert!(parse_command(r#"{"v":1,"type":"seek"}"#).is_err());
        assert!(parse_command(r#"{"v":1,"type":"seek","positionMs":"x"}"#).is_err());
        assert!(parse_command(r#"{"v":1,"type":"playSound"}"#).is_err());
        assert!(parse_command(r#"{"v":1,"type":"loadSound","name":"x"}"#).is_err());
    }

    #[test]
    fn lenient_numbers() {
        let seek = |n: &str| parse_command(&format!(r#"{{"v":1,"type":"seek","positionMs":{n}}}"#)).unwrap();
        let rel = |n: &str| parse_command(&format!(r#"{{"v":1,"type":"seekRelative","deltaMs":{n}}}"#)).unwrap();
        // round-half-away-from-zero
        assert_eq!(seek("1234.5"), Command::Seek { position_ms: 1235 });
        assert_eq!(seek("-5"), Command::Seek { position_ms: 0 });
        assert_eq!(seek("-0.4"), Command::Seek { position_ms: 0 });
        assert_eq!(rel("-10000.4"), Command::SeekRelative { delta_ms: -10000 });
        assert_eq!(rel("2.5"), Command::SeekRelative { delta_ms: 3 });
        assert_eq!(rel("-2.5"), Command::SeekRelative { delta_ms: -3 });
    }

    #[test]
    fn error_event_line_shape() {
        let line = Event::bad_message("x").to_line();
        assert_eq!(line, r#"{"v":1,"type":"error","code":"bad_message","message":"x"}"#);
    }
}
