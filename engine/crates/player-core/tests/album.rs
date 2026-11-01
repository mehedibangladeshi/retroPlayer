use std::fs;
use std::path::{Path, PathBuf};

use player_core::album::{scan_album, track_cover};
use player_core::error::ErrorCode;

fn fixture() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("tests/fixtures/sine_440hz_250ms_44100_mono.wav")
}

fn temp_dir(tag: &str) -> PathBuf {
    let d = std::env::temp_dir().join(format!("album_test_{}_{tag}", std::process::id()));
    let _ = fs::remove_dir_all(&d);
    fs::create_dir_all(&d).unwrap();
    d
}

#[test]
fn scans_order_skips_and_finds_folder_cover() {
    let dir = temp_dir("full");
    for n in ["02 b.wav", "01 a.wav", "10 c.wav", ".hidden.wav"] {
        fs::copy(fixture(), dir.join(n)).unwrap();
    }
    fs::write(dir.join("notes.txt"), b"hi").unwrap();
    fs::write(dir.join("Cover.JPG"), [0xff, 0xd8, 0xff]).unwrap();
    fs::create_dir(dir.join("sub")).unwrap();
    fs::copy(fixture(), dir.join("sub/d.wav")).unwrap();

    let album = scan_album(&dir).unwrap();
    let paths: Vec<_> = album.tracks.iter().map(|t| t.path.clone()).collect();
    assert_eq!(paths, ["01 a.wav", "02 b.wav", "10 c.wav"].map(|n| dir.join(n)));
    assert_eq!(album.tracks[0].title, "01 a");
    assert_eq!(album.tracks[0].duration_ms, Some(250));
    assert_eq!(album.title.as_deref(), dir.file_name().unwrap().to_str());
    assert_eq!(album.cover.as_ref().unwrap().mime, "image/jpeg");
    fs::remove_dir_all(&dir).unwrap();
}

#[test]
fn missing_dir_is_file_not_found() {
    let e = scan_album(Path::new("/nonexistent/album_dir")).unwrap_err();
    assert_eq!(e.code, ErrorCode::FileNotFound);
}

#[test]
fn dir_without_audio_is_unsupported() {
    let dir = temp_dir("empty");
    fs::write(dir.join("notes.txt"), b"hi").unwrap();
    let e = scan_album(&dir).unwrap_err();
    assert_eq!(e.code, ErrorCode::UnsupportedFormat);
    fs::remove_dir_all(&dir).unwrap();
}

#[test]
fn track_cover_uses_folder_image_or_none() {
    let dir = temp_dir("track_cover");
    fs::copy(fixture(), dir.join("a.wav")).unwrap();
    assert_eq!(track_cover(&dir.join("a.wav")), None);
    fs::write(dir.join("folder.png"), b"\x89PNG\r\n\x1a\n").unwrap();
    assert_eq!(track_cover(&dir.join("a.wav")).unwrap().mime, "image/png");
}
