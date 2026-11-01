//! engine-sidecar: NDJSON over stdin (commands) / stdout (events) around `Player`.
//!
//! Threading model:
//! - main thread: reads stdin lines (raw bytes, length-capped), parses commands, drives
//!   the `Player`, and turns every `Err` from the player into an `error` event.
//! - forwarder thread (one per Player): converts `PlayerEvent`s to wire events.
//! - writer thread: the only code that touches stdout; it drains one mpsc channel,
//!   writing and flushing one line per event so lines never interleave.
//!
//! Only a real EOF or IO error on stdin ends the loop: the player is dropped, the writer
//! is told to quit after flushing everything queued, and the process exits 0.
//! Bad input (invalid UTF-8, over-long lines, bad JSON) never exits. stderr is logs only.

mod protocol;

use std::io::{self, BufRead, Write};
use std::panic::{AssertUnwindSafe, catch_unwind};
use std::path::Path;
use std::sync::mpsc::{self, Sender};
use std::thread;

use player_core::{Player, PlayerError, PlayerEvent};
use protocol::{Command, Event, WireErrorCode, parse_command};

const MAX_LINE_BYTES: usize = 1024 * 1024;

enum Out {
    Event(Event),
    Quit,
}

#[derive(Debug, PartialEq, Eq)]
enum Read {
    Eof,
    Line,
    TooLong,
}

/// Read one line into `buf` (without the newline). Lines over `cap` bytes are
/// skipped up to the next `\\n` and reported as `TooLong`. Only a zero-byte read
/// is `Eof`; a final line lacking a newline is still returned as a line.
fn read_line_capped<R: BufRead>(r: &mut R, buf: &mut Vec<u8>, cap: usize) -> io::Result<Read> {
    buf.clear();
    let (mut seen, mut too_long) = (false, false);
    loop {
        let chunk = match r.fill_buf() {
            Ok(c) => c,
            Err(e) if e.kind() == io::ErrorKind::Interrupted => continue,
            Err(e) => return Err(e),
        };
        if chunk.is_empty() {
            return Ok(if !seen {
                Read::Eof
            } else if too_long {
                Read::TooLong
            } else {
                Read::Line
            });
        }
        seen = true;
        let nl = chunk.iter().position(|&b| b == b'\n');
        let take = nl.unwrap_or(chunk.len());
        if !too_long {
            buf.extend_from_slice(&chunk[..take]);
            if buf.len() > cap {
                too_long = true;
                buf.clear();
            }
        }
        r.consume(take + usize::from(nl.is_some()));
        if nl.is_some() {
            return Ok(if too_long { Read::TooLong } else { Read::Line });
        }
    }
}

fn log_bad_line(reason: &str, line: &str) {
    let snippet: String = line.chars().take(200).collect();
    eprintln!("engine-sidecar: bad message ({reason}): {snippet}");
}

fn spawn_forwarder(events: mpsc::Receiver<PlayerEvent>, tx: Sender<Out>) {
    thread::spawn(move || {
        for ev in events {
            if tx.send(Out::Event(ev.into())).is_err() {
                break;
            }
        }
    });
}

fn panic_message(p: &(dyn std::any::Any + Send)) -> String {
    p.downcast_ref::<&str>()
        .map(|s| s.to_string())
        .or_else(|| p.downcast_ref::<String>().cloned())
        .unwrap_or_else(|| "unknown".into())
}

fn dispatch(player: &mut Player, cmd: Command) -> Result<(), PlayerError> {
    match cmd {
        Command::Load { path } => player.load(Path::new(&path)),
        Command::Play => player.play(),
        Command::Pause => player.pause(),
        Command::Stop => player.stop(),
        Command::Seek { position_ms } => {
            player.seek(position_ms);
            Ok(())
        }
        Command::SeekRelative { delta_ms } => {
            player.seek_relative(delta_ms);
            Ok(())
        }
        // Key sounds are cosmetic: failures are logged, never sent as error events.
        Command::LoadSound { name, path } => {
            if let Err(e) = player.load_sound(&name, Path::new(&path)) {
                eprintln!("engine-sidecar: sound {name:?} not loaded: {}", e.message);
            }
            Ok(())
        }
        Command::PlaySound { name } => {
            if let Err(e) = player.play_sound(&name) {
                eprintln!("engine-sidecar: sound {name:?} not played: {}", e.message);
            }
            Ok(())
        }
    }
}

fn main() {
    let (mut player, player_events) = Player::new();
    let (tx, rx) = mpsc::channel::<Out>();

    let writer = thread::spawn(move || {
        let stdout = io::stdout();
        let mut out = stdout.lock();
        while let Ok(Out::Event(ev)) = rx.recv() {
            let line = ev.to_line();
            if writeln!(out, "{line}").and_then(|_| out.flush()).is_err() {
                break; // stdout closed; nothing more to do
            }
        }
    });

    let send = |ev: Event| {
        let _ = tx.send(Out::Event(ev));
    };

    send(player.snapshot().into());
    spawn_forwarder(player_events, tx.clone());

    let stdin = io::stdin();
    let mut stdin = stdin.lock();
    let mut buf = Vec::new();
    loop {
        match read_line_capped(&mut stdin, &mut buf, MAX_LINE_BYTES) {
            Ok(Read::Eof) | Err(_) => break,
            Ok(Read::TooLong) => {
                eprintln!("engine-sidecar: line too long, skipped");
                send(Event::bad_message("line too long"));
                continue;
            }
            Ok(Read::Line) => {}
        }
        let line = match std::str::from_utf8(&buf) {
            Ok(l) => l,
            Err(_) => {
                eprintln!("engine-sidecar: bad message (invalid UTF-8)");
                send(Event::bad_message("line is not valid UTF-8"));
                continue;
            }
        };
        if line.trim().is_empty() {
            continue;
        }
        let cmd = match parse_command(line) {
            Ok(c) => c,
            Err(reason) => {
                log_bad_line(&reason, line);
                send(Event::bad_message(reason));
                continue;
            }
        };
        match catch_unwind(AssertUnwindSafe(|| dispatch(&mut player, cmd))) {
            Ok(Ok(())) => {}
            Ok(Err(e)) => send(e.into()),
            Err(p) => {
                send(Event::Error {
                    code: WireErrorCode::Internal,
                    message: format!("engine panic: {}", panic_message(&*p)),
                });
                // The player may be left half-updated (locks, streams), so discard it
                // and start fresh rather than trust it; announce the fresh state.
                let old = std::mem::replace(&mut player, {
                    let (p, ev) = Player::new();
                    spawn_forwarder(ev, tx.clone());
                    p
                });
                let _ = catch_unwind(AssertUnwindSafe(move || drop(old)));
                send(player.snapshot().into());
            }
        }
    }

    let _ = catch_unwind(AssertUnwindSafe(move || drop(player)));
    let _ = tx.send(Out::Quit);
    let _ = writer.join();
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Cursor;

    fn read_all(input: &[u8], cap: usize) -> Vec<(Read, Vec<u8>)> {
        let mut r = Cursor::new(input.to_vec());
        let mut buf = Vec::new();
        let mut out = Vec::new();
        loop {
            let l = read_line_capped(&mut r, &mut buf, cap).unwrap();
            if l == Read::Eof {
                return out;
            }
            out.push((l, buf.clone()));
        }
    }

    #[test]
    fn splits_lines_and_handles_missing_final_newline() {
        let got = read_all(b"ab\n\ncd", 10);
        assert_eq!(got, vec![(Read::Line, b"ab".to_vec()), (Read::Line, vec![]), (Read::Line, b"cd".to_vec())]);
    }

    #[test]
    fn invalid_utf8_is_still_a_line() {
        assert_eq!(read_all(&[0xff, 0xfe, b'\n'], 10), vec![(Read::Line, vec![0xff, 0xfe])]);
    }

    #[test]
    fn long_line_is_skipped_then_reading_continues() {
        let got = read_all(b"0123456789abc\nok\n", 5);
        assert_eq!(got[0].0, Read::TooLong);
        assert_eq!(got[1], (Read::Line, b"ok".to_vec()));
        assert_eq!(got.len(), 2);
    }
}
