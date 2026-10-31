use std::path::PathBuf;

use player_core::decode::Decoder;
use player_core::error::ErrorCode;

fn fixture() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("tests/fixtures/sine_440hz_250ms_44100_mono.wav")
}

fn drain(d: &mut Decoder) -> (usize, f32, usize) {
    let mut buf = Vec::new();
    let (mut samples, mut peak, mut max_block) = (0, 0.0f32, 0);
    while d.next_block(&mut buf).unwrap() {
        samples += buf.len();
        max_block = max_block.max(buf.len());
        peak = buf.iter().fold(peak, |m, v| m.max(v.abs()));
    }
    (samples, peak, max_block)
}

#[test]
fn opens_and_reports_metadata() {
    let d = Decoder::open(&fixture()).unwrap();
    assert_eq!(d.sample_rate(), 44100);
    assert_eq!(d.channels(), 1);
    let dur = d.duration_ms().expect("duration");
    assert!((249..=251).contains(&dur), "duration {dur}");
    let info = d.track_info();
    assert_eq!(info.title, "sine_440hz_250ms_44100_mono");
    assert_eq!(info.sample_rate, 44100);
    assert_eq!(info.channels, 1);
    assert!(!info.codec.is_empty());
}

#[test]
fn decodes_all_frames_with_expected_peak() {
    let mut d = Decoder::open(&fixture()).unwrap();
    let (samples, peak, _) = drain(&mut d);
    assert_eq!(samples, 11025);
    assert!((peak - 0.5).abs() <= 0.02, "peak {peak}");
}

#[test]
fn seek_then_decode_remaining() {
    let mut d = Decoder::open(&fixture()).unwrap();
    let pos = d.seek(100).unwrap();
    // Accurate seek lands at or before the target, on a packet boundary (WAV packets are large).
    assert!(pos <= 100, "pos {pos}");
    let (samples, _, max_block) = drain(&mut d);
    // Remaining frames must match the reported position, and be within one packet of 100 ms.
    let from_pos = 11025 - (pos as usize * 44100 / 1000);
    assert!(samples.abs_diff(from_pos) <= 45, "remaining {samples}, from pos {from_pos}");
    assert!(samples.abs_diff(11025 - 4410) <= max_block + 1, "remaining {samples}");
    // Seeking past the end clamps rather than failing.
    let end = d.seek(10_000).unwrap();
    assert!(end <= 251, "end {end}");
}

#[test]
fn missing_file_is_file_not_found() {
    let e = Decoder::open(&fixture().with_file_name("nope.wav")).err().unwrap();
    assert_eq!(e.code, ErrorCode::FileNotFound);
}

#[test]
fn non_audio_file_is_unsupported() {
    let p = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("Cargo.toml");
    let e = Decoder::open(&p).err().unwrap();
    assert_eq!(e.code, ErrorCode::UnsupportedFormat);
}
