//! Wire types for the NDJSON protocol described in docs/PROTOCOL.md.

use player_core::{Album, Cover, ErrorCode, PlayerError, PlayerEvent, Snapshot, Status, TrackInfo};
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
    #[serde(rename_all = "camelCase")]
    LoadAlbum { path: String },
    /// `usize` makes serde reject negatives and non-integers.
    #[serde(rename_all = "camelCase")]
    PlayIndex { index: usize },
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
    Playlist { album: Option<WireAlbum> },
    /// `data:<mime>;base64,...` URL of the current track's art, or `null`.
    Artwork { cover: Option<String> },
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WireAlbum {
    pub dir: String,
    pub title: Option<String>,
    pub artist: Option<String>,
    pub year: Option<String>,
    /// `data:<mime>;base64,...` URL.
    pub cover: Option<String>,
    pub tracks: Vec<WireAlbumTrack>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WireAlbumTrack {
    pub path: String,
    pub title: String,
    pub artist: Option<String>,
    pub track_no: Option<u32>,
    pub duration_ms: Option<u64>,
}

/// `data:<mime>;base64,...` URL for a cover.
pub fn cover_url(c: &Cover) -> String {
    format!("data:{};base64,{}", c.mime, base64(&c.data))
}

impl From<&Album> for WireAlbum {
    fn from(a: &Album) -> Self {
        WireAlbum {
            dir: a.dir.to_string_lossy().into_owned(),
            title: a.title.clone(),
            artist: a.artist.clone(),
            year: a.year.clone(),
            cover: a.cover.as_ref().map(cover_url),
            tracks: a
                .tracks
                .iter()
                .map(|t| WireAlbumTrack {
                    path: t.path.to_string_lossy().into_owned(),
                    title: t.title.clone(),
                    artist: t.artist.clone(),
                    track_no: t.track_no,
                    duration_ms: t.duration_ms,
                })
                .collect(),
        }
    }
}

/// Standard base64 with padding (tiny encoder so we need no extra crate).
fn base64(data: &[u8]) -> String {
    const T: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity(data.len().div_ceil(3) * 4);
    for c in data.chunks(3) {
        let n = (u32::from(c[0]) << 16) | (u32::from(*c.get(1).unwrap_or(&0)) << 8) | u32::from(*c.get(2).unwrap_or(&0));
        for i in 0..4 {
            if i <= c.len() {
                out.push(T[((n >> (18 - 6 * i)) & 63) as usize] as char);
            } else {
                out.push('=');
            }
        }
    }
    out
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
            PlayerEvent::Ended { .. } => Event::Ended,
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
    fn base64_known_vectors() {
        for (i, o) in [("", ""), ("f", "Zg=="), ("fo", "Zm8="), ("foo", "Zm9v"), ("foob", "Zm9vYg==")] {
            assert_eq!(base64(i.as_bytes()), o);
        }
    }

    #[test]
    fn album_messages_round_trip() {
        assert_eq!(
            parse_command(r#"{"v":1,"type":"loadAlbum","path":"/a"}"#).unwrap(),
            Command::LoadAlbum { path: "/a".into() }
        );
        assert_eq!(parse_command(r#"{"v":1,"type":"playIndex","index":2}"#).unwrap(), Command::PlayIndex { index: 2 });
        assert_eq!(Event::Playlist { album: None }.to_line(), r#"{"v":1,"type":"playlist","album":null}"#);
    }

    #[test]
    fn play_index_rejects_negative_and_fractional() {
        assert!(parse_command(r#"{"v":1,"type":"playIndex","index":-1}"#).is_err());
        assert!(parse_command(r#"{"v":1,"type":"playIndex","index":1.5}"#).is_err());
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
