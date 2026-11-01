//! Album folder scanning (tags, order, cover art) and the pure playlist queue.

use std::fs::{self, File};
use std::path::{Path, PathBuf};

use symphonia::core::formats::probe::Hint;
use symphonia::core::formats::{FormatOptions, TrackType};
use symphonia::core::io::MediaSourceStream;
use symphonia::core::meta::{
    MetadataContainer, MetadataOptions, RawValue, StandardTag, StandardVisualKey, Visual,
};

use crate::error::{ErrorCode, PlayerError};

const AUDIO_EXTS: [&str; 7] = ["flac", "wav", "mp3", "m4a", "aac", "ogg", "oga"];
const COVER_STEMS: [&str; 4] = ["cover", "folder", "front", "album"];
const MAX_COVER_BYTES: usize = 8 * 1024 * 1024;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Cover {
    pub mime: String,
    pub data: Vec<u8>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AlbumTrack {
    pub path: PathBuf,
    pub title: String,
    pub artist: Option<String>,
    pub track_no: Option<u32>,
    pub disc_no: Option<u32>,
    pub duration_ms: Option<u64>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Album {
    pub dir: PathBuf,
    pub title: Option<String>,
    pub artist: Option<String>,
    pub year: Option<String>,
    pub cover: Option<Cover>,
    pub tracks: Vec<AlbumTrack>,
}

/// Tags read from one file, before they are merged into the album.
struct Scanned {
    track: AlbumTrack,
    album: Option<String>,
    album_artist: Option<String>,
    year: Option<String>,
    /// (is front cover, cover)
    cover: Option<(bool, Cover)>,
}

/// Accepts "3" and "3/12".
fn parse_no(s: &str) -> Option<u32> {
    s.split('/').next()?.trim().parse().ok()
}

fn first_year(s: &str) -> Option<String> {
    let y: String = s.trim().chars().take(4).collect();
    (y.len() == 4 && y.bytes().all(|b| b.is_ascii_digit())).then_some(y)
}

fn nonempty(s: &str) -> Option<String> {
    let s = s.trim();
    (!s.is_empty()).then(|| s.to_string())
}

/// Number from a standard tag, else from the raw tag (ID3 "TRCK" may hold "3/12").
fn number(
    m: &MetadataContainer,
    raw_keys: [&str; 2],
    std: impl Fn(&StandardTag) -> Option<u64>,
) -> Option<u32> {
    m.tags.iter().find_map(|t| {
        if let Some(n) = t.std.as_ref().and_then(&std) {
            return u32::try_from(n).ok();
        }
        match &t.raw.value {
            RawValue::String(s) if raw_keys.iter().any(|k| t.raw.key.eq_ignore_ascii_case(k)) => {
                parse_no(s)
            }
            _ => None,
        }
    })
}

fn sniff_mime(data: &[u8]) -> &'static str {
    if data.starts_with(b"\x89PNG") { "image/png" } else { "image/jpeg" }
}

fn scan_file(dir: &Path, name: &str) -> Option<Scanned> {
    let path = dir.join(name);
    let mss = MediaSourceStream::new(Box::new(File::open(&path).ok()?), Default::default());
    let mut hint = Hint::new();
    if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
        hint.with_extension(ext);
    }
    let mut format = symphonia::default::get_probe()
        .probe(&hint, mss, FormatOptions::default(), MetadataOptions::default())
        .ok()?;
    let track = format.default_track(TrackType::Audio)?;
    let rate = track.codec_params.as_ref()?.audio()?.sample_rate.filter(|r| *r > 0);
    // Frame count only; audio is never decoded here.
    let duration_ms = track.num_frames.zip(rate).map(|(n, r)| n.saturating_mul(1000) / u64::from(r));

    let stem = path.file_stem().map(|s| s.to_string_lossy().into_owned()).unwrap_or_default();
    let mut s = Scanned {
        track: AlbumTrack {
            path,
            title: stem,
            artist: None,
            track_no: None,
            disc_no: None,
            duration_ms,
        },
        album: None,
        album_artist: None,
        year: None,
        cover: None,
    };
    // Probe-time metadata (ID3, leading tags) is attached to the reader's metadata log.
    if let Some(rev) = format.metadata().skip_to_latest() {
        let m = &rev.media;
        let (mut title, mut artist) = (None, None);
        for t in &m.tags {
            match &t.std {
                Some(StandardTag::TrackTitle(v)) => title = title.or_else(|| nonempty(v)),
                Some(StandardTag::Artist(v)) => artist = artist.or_else(|| nonempty(v)),
                Some(StandardTag::Album(v)) => s.album = s.album.take().or_else(|| nonempty(v)),
                Some(StandardTag::AlbumArtist(v)) => {
                    s.album_artist = s.album_artist.take().or_else(|| nonempty(v))
                }
                Some(
                    StandardTag::ReleaseDate(v)
                    | StandardTag::RecordingDate(v)
                    | StandardTag::OriginalReleaseDate(v),
                ) => s.year = s.year.take().or_else(|| first_year(v)),
                Some(
                    StandardTag::ReleaseYear(y)
                    | StandardTag::RecordingYear(y)
                    | StandardTag::OriginalReleaseYear(y),
                ) => s.year = s.year.take().or_else(|| Some(y.to_string())),
                _ => {}
            }
        }
        if let Some(t) = title {
            s.track.title = t;
        }
        s.track.artist = artist;
        s.track.track_no = number(m, ["TRCK", "TRACKNUMBER"], |t| match t {
            StandardTag::TrackNumber(n) => Some(*n),
            _ => None,
        });
        s.track.disc_no = number(m, ["TPOS", "DISCNUMBER"], |t| match t {
            StandardTag::DiscNumber(n) => Some(*n),
            _ => None,
        });
        let usable = |v: &&Visual| !v.data.is_empty() && v.data.len() <= MAX_COVER_BYTES;
        let v = m
            .visuals
            .iter()
            .filter(usable)
            .find(|v| v.usage == Some(StandardVisualKey::FrontCover))
            .map(|v| (true, v))
            .or_else(|| m.visuals.iter().find(usable).map(|v| (false, v)));
        s.cover = v.map(|(front, v)| {
            let mime = v.media_type.clone().unwrap_or_else(|| sniff_mime(&v.data).into());
            (front, Cover { mime, data: v.data.to_vec() })
        });
    }
    Some(s)
}

fn folder_cover(dir: &Path, names: &[String]) -> Option<Cover> {
    names.iter().find_map(|n| {
        let p = Path::new(n);
        let stem = p.file_stem()?.to_str()?.to_ascii_lowercase();
        let mime = match p.extension()?.to_str()?.to_ascii_lowercase().as_str() {
            "jpg" | "jpeg" => "image/jpeg",
            "png" => "image/png",
            _ => return None,
        };
        if !COVER_STEMS.contains(&stem.as_str()) {
            return None;
        }
        let path = dir.join(n);
        if fs::metadata(&path).ok()?.len() > MAX_COVER_BYTES as u64 {
            return None;
        }
        Some(Cover { mime: mime.into(), data: fs::read(path).ok()? })
    })
}

/// Visible file names in `dir`, sorted so tie-breaks are deterministic.
/// Non-UTF-8 names are skipped.
fn dir_names(dir: &Path) -> std::io::Result<Vec<String>> {
    let mut names: Vec<String> = fs::read_dir(dir)?
        .filter_map(|e| e.ok())
        .filter(|e| e.path().is_file())
        .filter_map(|e| e.file_name().into_string().ok())
        .filter(|n| !n.starts_with('.'))
        .collect();
    names.sort();
    Ok(names)
}

/// Cover for one track: its embedded art, else the folder image next to it.
pub fn track_cover(path: &Path) -> Option<Cover> {
    let dir = path.parent().filter(|d| !d.as_os_str().is_empty()).unwrap_or(Path::new("."));
    let embedded = scan_file(dir, path.file_name()?.to_str()?).and_then(|s| s.cover);
    embedded.map(|c| c.1).or_else(|| folder_cover(dir, &dir_names(dir).ok()?))
}

pub fn scan_album(dir: &Path) -> Result<Album, PlayerError> {
    if !dir.is_dir() {
        return Err(PlayerError::new(
            ErrorCode::FileNotFound,
            format!("{}: not a folder", dir.display()),
        ));
    }
    let names = dir_names(dir)
        .map_err(|e| PlayerError::new(ErrorCode::Internal, format!("{}: {e}", dir.display())))?;

    let scanned: Vec<Scanned> = names
        .iter()
        .filter(|n| {
            Path::new(n.as_str())
                .extension()
                .and_then(|e| e.to_str())
                .is_some_and(|e| AUDIO_EXTS.contains(&e.to_ascii_lowercase().as_str()))
        })
        .filter_map(|n| scan_file(dir, n))
        .collect();
    if scanned.is_empty() {
        return Err(PlayerError::new(
            ErrorCode::UnsupportedFormat,
            format!("{}: no playable audio files", dir.display()),
        ));
    }

    let covers = || scanned.iter().filter_map(|s| s.cover.as_ref());
    let cover = covers()
        .find(|c| c.0)
        .or_else(|| covers().next())
        .map(|c| c.1.clone())
        .or_else(|| folder_cover(dir, &names));

    let first = |f: fn(&Scanned) -> &Option<String>| scanned.iter().find_map(|s| f(s).clone());
    let title = first(|s| &s.album)
        .or_else(|| dir.file_name().and_then(|n| n.to_str()).and_then(nonempty));
    let artist = first(|s| &s.album_artist)
        .or_else(|| scanned.iter().find_map(|s| s.track.artist.clone()));
    let year = first(|s| &s.year);

    // `names` is sorted and the sort below is stable, so file name is the final tie-break.
    let mut tracks: Vec<AlbumTrack> = scanned.into_iter().map(|s| s.track).collect();
    tracks.sort_by_key(|t| (t.disc_no.unwrap_or(1), t.track_no.unwrap_or(u32::MAX)));

    Ok(Album { dir: dir.to_path_buf(), title, artist, year, cover, tracks })
}

/// An album plus a cursor. Pure data, no playback.
#[derive(Debug, Clone)]
pub struct Playlist {
    album: Album,
    current: Option<usize>,
}

impl Playlist {
    pub fn new(album: Album) -> Self {
        Self { album, current: None }
    }

    pub fn album(&self) -> &Album {
        &self.album
    }

    pub fn current(&self) -> Option<usize> {
        self.current
    }

    pub fn select(&mut self, index: usize) -> Option<&Path> {
        let track = self.album.tracks.get(index)?;
        self.current = Some(index);
        Some(&track.path)
    }

    pub fn advance(&mut self) -> Option<&Path> {
        self.select(self.current? + 1)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn playlist(n: usize) -> Playlist {
        let tracks = (0..n)
            .map(|i| AlbumTrack {
                path: PathBuf::from(format!("{i}.wav")),
                title: i.to_string(),
                artist: None,
                track_no: None,
                disc_no: None,
                duration_ms: None,
            })
            .collect();
        Playlist::new(Album {
            dir: PathBuf::new(),
            title: None,
            artist: None,
            year: None,
            cover: None,
            tracks,
        })
    }

    #[test]
    fn track_number_accepts_total() {
        assert_eq!(parse_no("3/12"), Some(3));
        assert_eq!(parse_no("3"), Some(3));
        assert_eq!(parse_no("x"), None);
    }

    #[test]
    fn select_and_advance_bounds() {
        let mut p = playlist(2);
        assert_eq!(p.advance(), None); // nothing selected
        assert_eq!(p.current(), None);
        assert_eq!(p.select(5), None);
        assert_eq!(p.current(), None);
        assert_eq!(p.select(0), Some(Path::new("0.wav")));
        assert_eq!(p.advance(), Some(Path::new("1.wav")));
        assert_eq!(p.advance(), None); // past the last
        assert_eq!(p.current(), Some(1));
    }
}
