use std::io::{BufRead, BufReader, Write};
use std::path::PathBuf;
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::mpsc::{self, Receiver};
use std::thread;
use std::time::Duration;

use serde_json::{Value, json};

const FIXTURE: &str = concat!(env!("CARGO_MANIFEST_DIR"), "/../player-core/tests/fixtures/sine_440hz_250ms_44100_mono.wav");

struct Sidecar {
    child: Child,
    stdin: ChildStdin,
    lines: Receiver<String>,
}

impl Sidecar {
    fn spawn() -> Self {
        let mut child = Command::new(env!("CARGO_BIN_EXE_engine-sidecar"))
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .spawn()
            .unwrap();
        let stdin = child.stdin.take().unwrap();
        let stdout = child.stdout.take().unwrap();
        let (tx, lines) = mpsc::channel();
        thread::spawn(move || {
            for l in BufReader::new(stdout).lines().map_while(Result::ok) {
                if tx.send(l).is_err() {
                    break;
                }
            }
        });
        let s = Sidecar { child, stdin, lines };
        s.next(); // startup state
        s
    }

    fn send(&mut self, v: Value) {
        writeln!(self.stdin, "{v}").unwrap();
        self.stdin.flush().unwrap();
    }

    /// Next event that is not a `position` tick.
    fn next(&self) -> Value {
        loop {
            let l = self.lines.recv_timeout(Duration::from_secs(10)).expect("timed out waiting for a line");
            let v: Value = serde_json::from_str(&l).unwrap();
            if v["type"] != "position" {
                return v;
            }
        }
    }
}

impl Drop for Sidecar {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

/// Unique temp dir holding the fixture as "02 b.wav" and "01 a.wav".
fn album_dir(tag: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(format!("retro-album-{tag}-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).unwrap();
    for n in ["02 b.wav", "01 a.wav"] {
        std::fs::copy(FIXTURE, dir.join(n)).unwrap();
    }
    dir
}

#[test]
fn load_album_emits_playlist_then_state_or_error() {
    let dir = album_dir("load");
    let mut s = Sidecar::spawn();
    s.send(json!({"v":1,"type":"loadAlbum","path":dir}));
    let v = s.next();
    assert_eq!(v["type"], "playlist", "{v}");
    let a = &v["album"];
    assert_eq!(a["dir"], dir.to_string_lossy().as_ref());
    assert!(a["cover"].is_null());
    let paths: Vec<_> = a["tracks"].as_array().unwrap().iter().map(|t| t["path"].as_str().unwrap().to_owned()).collect();
    assert_eq!(paths, [dir.join("01 a.wav"), dir.join("02 b.wav")].map(|p| p.to_string_lossy().into_owned()));
    // Next is a state for the first track, or no_output_device when there is no audio device.
    let v = s.next();
    if v["type"] == "error" {
        assert_eq!(v["code"], "no_output_device", "{v}");
    } else {
        assert_eq!(v["type"], "state", "{v}");
        assert_eq!(v["trackInfo"]["path"], paths[0].as_str());
    }
    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn load_album_missing_dir_is_file_not_found() {
    let mut s = Sidecar::spawn();
    s.send(json!({"v":1,"type":"loadAlbum","path":"/definitely/not/here"}));
    let v = s.next();
    assert_eq!((v["type"].as_str(), v["code"].as_str()), (Some("error"), Some("file_not_found")), "{v}");
}

#[test]
fn play_index_without_album_is_invalid_state() {
    let mut s = Sidecar::spawn();
    s.send(json!({"v":1,"type":"playIndex","index":0}));
    let v = s.next();
    assert_eq!((v["type"].as_str(), v["code"].as_str()), (Some("error"), Some("invalid_state")), "{v}");
}

#[test]
fn single_load_clears_album_before_loading() {
    let dir = album_dir("clear");
    let mut s = Sidecar::spawn();
    s.send(json!({"v":1,"type":"loadAlbum","path":dir}));
    assert_eq!(s.next()["type"], "playlist");
    s.send(json!({"v":1,"type":"load","path":FIXTURE}));
    // The album's own load results may still be queued ahead of the clear; the clear must
    // arrive and the fixture's state (if any) must come after it.
    let mut cleared = false;
    loop {
        let v = s.next();
        if v["type"] == "playlist" {
            assert!(v["album"].is_null(), "{v}");
            cleared = true;
        } else if cleared && v["type"] == "state" && v["trackInfo"]["path"] == FIXTURE {
            break;
        } else if cleared && v["type"] == "error" {
            break; // no audio device
        }
    }
    let _ = std::fs::remove_dir_all(&dir);
}

/// Needs an audio device: the second track must start by itself after the first ends.
#[test]
#[ignore]
fn device_album_auto_advances() {
    let dir = album_dir("advance");
    let second = dir.join("02 b.wav").to_string_lossy().into_owned();
    let mut s = Sidecar::spawn();
    s.send(json!({"v":1,"type":"loadAlbum","path":dir}));
    loop {
        let v = s.next();
        if v["type"] == "state" && v["status"] == "playing" && v["trackInfo"]["path"] == second.as_str() {
            break;
        }
        assert_ne!(v["type"], "error", "{v}");
    }
    let _ = std::fs::remove_dir_all(&dir);
}

/// Reads events until the load's state or an error; returns (artwork events, error code).
fn until_loaded(s: &Sidecar) -> (Vec<Value>, Option<String>) {
    let mut art = vec![];
    loop {
        let v = s.next();
        match v["type"].as_str() {
            Some("artwork") => art.push(v),
            Some("state") => {
                // `artwork` is sent by the main thread and `state` by the forwarder thread,
                // so the artwork may land just after the state: drain briefly.
                while let Ok(l) = s.lines.recv_timeout(Duration::from_millis(300)) {
                    let v: Value = serde_json::from_str(&l).unwrap();
                    if v["type"] == "artwork" {
                        art.push(v);
                    }
                }
                return (art, None);
            }
            Some("error") => return (art, v["code"].as_str().map(str::to_owned)),
            _ => {}
        }
    }
}

#[test]
fn artwork_is_sent_on_change_only() {
    let dir = album_dir("art");
    std::fs::write(dir.join("cover.jpg"), [0xff, 0xd8, 0xff, 0xe0]).unwrap();
    let bare = std::env::temp_dir().join(format!("retro-bare-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&bare);
    std::fs::create_dir_all(&bare).unwrap();
    std::fs::copy(FIXTURE, bare.join("x.wav")).unwrap();

    let mut s = Sidecar::spawn();
    s.send(json!({"v":1,"type":"load","path":dir.join("01 a.wav")}));
    let (art, err) = until_loaded(&s);
    if err.is_some() {
        // Artwork is sent after a successful load only; without a device, nothing to check.
        assert_eq!(err.as_deref(), Some("no_output_device"));
        return;
    }
    assert_eq!(art.len(), 1, "{art:?}");
    assert!(art[0]["cover"].as_str().unwrap().starts_with("data:image/jpeg;base64,"));

    s.send(json!({"v":1,"type":"load","path":dir.join("02 b.wav")}));
    assert!(until_loaded(&s).0.is_empty(), "same art must not be re-sent");

    s.send(json!({"v":1,"type":"load","path":bare.join("x.wav")}));
    let (art, _) = until_loaded(&s);
    assert_eq!(art.len(), 1, "{art:?}");
    assert!(art[0]["cover"].is_null());
    let _ = std::fs::remove_dir_all(&dir);
    let _ = std::fs::remove_dir_all(&bare);
}
