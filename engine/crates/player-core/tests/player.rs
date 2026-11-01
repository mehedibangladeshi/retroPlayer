use std::path::PathBuf;
use std::sync::mpsc::TryRecvError;

use player_core::{ErrorCode, Player, PlayerEvent, Status};

fn fixture() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("tests/fixtures/sine_440hz_250ms_44100_mono.wav")
}

#[test]
fn new_player_is_empty_and_rejects_play() {
    let (mut p, rx) = Player::new();
    let s = p.snapshot();
    assert_eq!(s.status, Status::Empty);
    assert_eq!(s.position_ms, 0);
    assert!(s.track.is_none());
    assert_eq!(p.play().unwrap_err().code, ErrorCode::InvalidState);
    assert_eq!(p.pause().unwrap_err().code, ErrorCode::InvalidState);
    p.seek(1000);
    p.seek_relative(-500);
    assert_eq!(p.snapshot().status, Status::Empty);
    assert_eq!(p.snapshot().position_ms, 0);
    assert!(p.stop().is_ok());
    assert_eq!(p.snapshot().status, Status::Empty);
    // Seeks on Empty emit nothing.
    while let Ok(ev) = rx.try_recv() {
        assert!(matches!(ev, PlayerEvent::State(_)), "unexpected {ev:?}");
    }
}

#[test]
fn load_fixture_or_no_device() {
    let (mut p, rx) = Player::new();
    match p.load(&fixture()) {
        Err(e) => {
            assert_eq!(e.code, ErrorCode::NoOutputDevice);
            assert_eq!(p.snapshot().status, Status::Empty);
            assert_eq!(rx.try_recv().unwrap_err(), TryRecvError::Empty);
        }
        Ok(()) => {
            let s = p.snapshot();
            assert_eq!(s.status, Status::Stopped);
            assert!((249..=251).contains(&s.duration_ms.unwrap()));
            assert!(matches!(rx.try_recv(), Ok(PlayerEvent::State(_))));
        }
    }
}

#[test]
fn generation_counts_successful_loads_only() {
    let (mut p, _rx) = Player::new();
    assert_eq!(p.generation(), 0);
    assert!(p.load(std::path::Path::new("/nonexistent/x.wav")).is_err());
    assert_eq!(p.generation(), 0);
    match p.load(&fixture()) {
        Ok(()) => {
            assert_eq!(p.generation(), 1);
            p.load(&fixture()).unwrap();
            assert_eq!(p.generation(), 2);
        }
        Err(e) => {
            assert_eq!(e.code, ErrorCode::NoOutputDevice);
            assert_eq!(p.generation(), 0);
        }
    }
}

// ---- device-dependent tests (run with --ignored) ----

use std::sync::mpsc::Receiver;
use std::time::{Duration, Instant};

fn loaded() -> Option<(Player, Receiver<PlayerEvent>)> {
    let (mut p, rx) = Player::new();
    match p.load(&fixture()) {
        Ok(()) => Some((p, rx)),
        Err(e) if e.code == ErrorCode::NoOutputDevice => {
            eprintln!("note: no output device, skipping");
            None
        }
        Err(e) => panic!("load failed: {e}"),
    }
}

/// Play to the end; returns (saw_position, saw_ended, state_after_ended).
fn play_to_end(p: &mut Player, rx: &Receiver<PlayerEvent>) -> (bool, bool, bool) {
    p.play().unwrap();
    let (mut pos, mut ended, mut stopped) = (false, false, false);
    let deadline = Instant::now() + Duration::from_secs(2);
    while Instant::now() < deadline && !(ended && stopped) {
        match rx.recv_timeout(Duration::from_millis(100)) {
            Ok(PlayerEvent::Position { .. }) => pos = true,
            Ok(PlayerEvent::Ended { generation }) => {
                assert_eq!(generation, p.generation());
                ended = true
            },
            Ok(PlayerEvent::State(s)) if ended => {
                stopped = s.status == Status::Stopped && s.position_ms == 0;
            }
            Ok(PlayerEvent::Error(e)) => panic!("error event: {e}"),
            _ => {}
        }
    }
    (pos, ended, stopped)
}

#[test]
#[ignore = "needs an audio output device; run with --ignored"]
fn device_load_play_ends() {
    let Some((mut p, rx)) = loaded() else { return };
    let s = p.snapshot();
    assert_eq!(s.status, Status::Stopped);
    assert!((249..=251).contains(&s.duration_ms.unwrap()));
    let (pos, ended, stopped) = play_to_end(&mut p, &rx);
    assert!(pos, "no Position events");
    assert!(ended, "no Ended event");
    assert!(stopped, "no State Stopped/0 after Ended");
}

#[test]
#[ignore = "needs an audio output device; run with --ignored"]
fn device_seek_clamps() {
    let Some((mut p, _rx)) = loaded() else { return };
    p.seek(10_000);
    let s = p.snapshot();
    assert!(s.position_ms <= s.duration_ms.unwrap());
}

#[test]
#[ignore = "needs an audio output device; run with --ignored"]
fn device_pause_holds_and_stop_resets() {
    let Some((mut p, _rx)) = loaded() else { return };
    p.seek(100);
    p.play().unwrap();
    std::thread::sleep(Duration::from_millis(40));
    p.pause().unwrap();
    let a = p.snapshot();
    std::thread::sleep(Duration::from_millis(100));
    let b = p.snapshot();
    assert_eq!(a, b);
    assert_eq!(b.status, Status::Paused);
    p.stop().unwrap();
    let s = p.snapshot();
    assert_eq!((s.status, s.position_ms), (Status::Stopped, 0));
}

#[test]
#[ignore = "needs an audio output device; run with --ignored"]
fn device_seek_after_ended_resumes_from_target() {
    let Some((mut p, rx)) = loaded() else { return };
    let (_, ended, _) = play_to_end(&mut p, &rx);
    assert!(ended);
    p.seek(150);
    let s = p.snapshot();
    assert!(s.position_ms > 0, "seek lost: {}", s.position_ms);
    p.play().unwrap();
    let s = p.snapshot();
    assert!(s.position_ms >= 100, "play restarted from 0: {}", s.position_ms);
}

#[test]
fn play_sound_unknown_name_is_an_error() {
    let (mut p, _rx) = Player::new();
    assert!(p.play_sound("nope").is_err());
}

#[test]
fn load_sound_missing_file_is_an_error() {
    let (mut p, _rx) = Player::new();
    assert!(p.load_sound("click", std::path::Path::new("/nonexistent/click.wav")).is_err());
}

#[test]
#[ignore = "needs an audio device"]
fn load_then_play_sound_and_reload_while_playing() {
    let (mut p, _rx) = Player::new();
    p.load_sound("click", &fixture()).unwrap();
    p.play_sound("click").unwrap();
    // Replacing a sound whose clip is still playing must not panic or free it in the callback.
    p.load_sound("click", &fixture()).unwrap();
    p.play_sound("click").unwrap();
}
