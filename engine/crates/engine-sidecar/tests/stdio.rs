use std::io::{BufRead, BufReader, Write};
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::mpsc::{self, Receiver};
use std::thread;
use std::time::{Duration, Instant};

use serde_json::Value;

struct Sidecar {
    child: Child,
    stdin: Option<ChildStdin>,
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
        let stdin = child.stdin.take();
        let stdout = child.stdout.take().unwrap();
        let (tx, lines) = mpsc::channel();
        thread::spawn(move || {
            for l in BufReader::new(stdout).lines().map_while(Result::ok) {
                if tx.send(l).is_err() {
                    break;
                }
            }
        });
        Sidecar { child, stdin, lines }
    }

    fn send(&mut self, line: &str) {
        let stdin = self.stdin.as_mut().unwrap();
        writeln!(stdin, "{line}").unwrap();
        stdin.flush().unwrap();
    }

    fn send_raw(&mut self, bytes: &[u8]) {
        let stdin = self.stdin.as_mut().unwrap();
        stdin.write_all(bytes).unwrap();
        stdin.flush().unwrap();
    }

    fn next(&self) -> Value {
        let l = self.lines.recv_timeout(Duration::from_secs(10)).expect("timed out waiting for a line");
        serde_json::from_str(&l).unwrap()
    }

    /// Next event that is not a `position` tick.
    fn next_event(&self) -> Value {
        loop {
            let v = self.next();
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

fn assert_error(v: &Value, code: &str) {
    assert_eq!(v["v"], 1);
    assert_eq!(v["type"], "error", "{v}");
    assert_eq!(v["code"], code, "{v}");
    assert!(v["message"].is_string());
}

#[test]
fn startup_state_is_empty() {
    let s = Sidecar::spawn();
    let v = s.next();
    assert_eq!(v["v"], 1);
    assert_eq!(v["type"], "state");
    assert_eq!(v["status"], "empty");
    assert_eq!(v["positionMs"], 0);
    assert!(v["durationMs"].is_null());
    assert!(v["trackInfo"].is_null());
}

#[test]
fn garbage_gives_bad_message_and_process_survives() {
    let mut s = Sidecar::spawn();
    s.next();
    s.send("this is not json");
    assert_error(&s.next_event(), "bad_message");
    s.send(r#"{"v":2,"type":"play"}"#);
    assert_error(&s.next_event(), "bad_message");
    s.send(r#"{"v":1,"type":"nope"}"#);
    assert_error(&s.next_event(), "bad_message");
    s.send("");
    assert!(s.child.try_wait().unwrap().is_none());
    s.send(r#"{"v":1,"type":"play"}"#);
    assert_error(&s.next_event(), "invalid_state");
}

#[test]
fn load_missing_file() {
    let mut s = Sidecar::spawn();
    s.next();
    s.send(r#"{"v":1,"type":"load","path":"/definitely/not/here.mp3"}"#);
    assert_error(&s.next_event(), "file_not_found");
}

#[test]
fn load_fixture() {
    let path = concat!(env!("CARGO_MANIFEST_DIR"), "/../player-core/tests/fixtures/sine_440hz_250ms_44100_mono.wav");
    let mut s = Sidecar::spawn();
    s.next();
    s.send(&serde_json::json!({"v":1,"type":"load","path":path}).to_string());
    let v = s.next_event();
    if v["type"] == "error" {
        assert_error(&v, "no_output_device");
    } else {
        assert_eq!(v["type"], "state", "{v}");
        assert_eq!(v["status"], "stopped");
        let d = v["durationMs"].as_u64().expect("durationMs");
        assert!((245..=255).contains(&d), "duration {d}");
        assert_eq!(v["trackInfo"]["channels"], 1);
    }
}

#[test]
fn closing_stdin_exits_zero() {
    let mut s = Sidecar::spawn();
    s.next();
    s.stdin = None;
    let start = Instant::now();
    loop {
        if let Some(status) = s.child.try_wait().unwrap() {
            assert!(status.success());
            return;
        }
        assert!(start.elapsed() < Duration::from_secs(2), "did not exit within 2s");
        thread::sleep(Duration::from_millis(20));
    }
}

#[test]
fn invalid_utf8_line_is_bad_message_and_process_survives() {
    let mut s = Sidecar::spawn();
    s.next();
    s.send_raw(&[0xff, 0xfe, b'\n']);
    assert_error(&s.next_event(), "bad_message");
    assert!(s.child.try_wait().unwrap().is_none());
    s.send(r#"{"v":1,"type":"play"}"#);
    assert_error(&s.next_event(), "invalid_state");
}

#[test]
fn fractional_and_negative_seek_are_accepted() {
    let mut s = Sidecar::spawn();
    s.next();
    s.send(r#"{"v":1,"type":"seek","positionMs":1234.5}"#);
    s.send(r#"{"v":1,"type":"seek","positionMs":-5}"#);
    s.send(r#"{"v":1,"type":"seekRelative","deltaMs":-10000.4}"#);
    s.send(r#"{"v":1,"type":"play"}"#);
    assert_error(&s.next_event(), "invalid_state");
}
