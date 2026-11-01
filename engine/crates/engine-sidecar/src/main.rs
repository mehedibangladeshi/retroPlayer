//! engine-sidecar: NDJSON over stdin (commands) / stdout (events) around `Player`.
//!
//! Threading model:
//! - input thread: reads stdin lines (raw bytes, length-capped) and sends each line, bad
//!   input reason, or EOF to the main thread over one mpsc channel (`Input`).
//! - main thread: `recv()`s that channel, parses commands, drives the `Player` (it stays
//!   single-owner here), turns every `Err` into an `error` event, and owns the album
//!   playlist, including auto-advance when the forwarder reports `Input::Ended`.
//! - forwarder thread (one per Player): converts `PlayerEvent`s to wire events and also
//!   posts `Input::Ended` into the main channel so the main thread can advance.
//! - writer thread: the only code that touches stdout; it drains one mpsc channel,
//!   writing and flushing one line per event so lines never interleave.
//!
//! Only a real EOF or IO error on stdin ends the loop: the player is dropped, the writer
//! is told to quit after flushing everything queued, and the process exits 0.
//! Bad input (invalid UTF-8, over-long lines, bad JSON) never exits. stderr is logs only.

mod protocol;

use std::collections::HashMap;
use std::io::{self, BufRead, Write};
use std::panic::{AssertUnwindSafe, catch_unwind};
use std::path::Path;
use std::sync::mpsc::{self, Sender};
use std::thread;

use player_core::{Cover, ErrorCode, Playlist, Player, PlayerError, PlayerEvent, Status, scan_album, track_cover};
use protocol::{Command, Event, WireAlbum, WireErrorCode, cover_url, parse_command};

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

/// Everything the main thread reacts to.
enum Input {
    Line(String),
    /// Unusable input (too long, invalid UTF-8); the reason goes out as `bad_message`.
    Bad(String),
    Eof,
    /// The player finished a track (may be stale; see `on_ended`).
    /// Carries the generation of the track that ended.
    Ended(u64),
}

fn spawn_reader(tx: Sender<Input>) {
    thread::spawn(move || {
        let stdin = io::stdin();
        let mut stdin = stdin.lock();
        let mut buf = Vec::new();
        loop {
            let msg = match read_line_capped(&mut stdin, &mut buf, MAX_LINE_BYTES) {
                Ok(Read::Eof) | Err(_) => Input::Eof,
                Ok(Read::TooLong) => {
                    eprintln!("engine-sidecar: line too long, skipped");
                    Input::Bad("line too long".into())
                }
                Ok(Read::Line) => match std::str::from_utf8(&buf) {
                    Ok(l) if l.trim().is_empty() => continue,
                    Ok(l) => Input::Line(l.to_owned()),
                    Err(_) => {
                        eprintln!("engine-sidecar: bad message (invalid UTF-8)");
                        Input::Bad("line is not valid UTF-8".into())
                    }
                },
            };
            let eof = matches!(msg, Input::Eof);
            if tx.send(msg).is_err() || eof {
                break;
            }
        }
    });
}

fn spawn_forwarder(events: mpsc::Receiver<PlayerEvent>, tx: Sender<Out>, input: Sender<Input>) {
    thread::spawn(move || {
        for ev in events {
            let ended = if let PlayerEvent::Ended { generation } = ev { Some(generation) } else { None };
            if tx.send(Out::Event(ev.into())).is_err() {
                break;
            }
            if let Some(g) = ended {
                let _ = input.send(Input::Ended(g));
            }
        }
    });
}

/// Send `artwork` only when the cover differs from the last one sent.
fn publish_art(art: &mut Option<Cover>, cover: Option<Cover>, send: &dyn Fn(Event)) {
    if *art != cover {
        send(Event::Artwork { cover: cover.as_ref().map(cover_url) });
        *art = cover;
    }
}

/// Load a track, then publish its art (file's own, else the album's) before playing.
/// A failed load counts as no art.
fn load_track(
    player: &mut Player,
    path: &Path,
    album_cover: Option<&Cover>,
    art: &mut Option<Cover>,
    send: &dyn Fn(Event),
    play: bool,
) -> Result<(), PlayerError> {
    let r = player.load(path);
    let cover = if r.is_ok() { track_cover(path).or_else(|| album_cover.cloned()) } else { None };
    publish_art(art, cover, send);
    r?;
    if play { player.play() } else { Ok(()) }
}

fn invalid_state(msg: &str) -> PlayerError {
    PlayerError::new(ErrorCode::InvalidState, msg)
}

/// A stale `Ended` (older generation) or one for a track the user already replaced must not advance.
fn should_advance(
    ended_gen: u64,
    current_gen: u64,
    status: Status,
    track: Option<&Path>,
    playlist_current: Option<&Path>,
) -> bool {
    ended_gen == current_gen && status == Status::Stopped && track == playlist_current
}

/// Auto-advance on a track end. An `Ended` can be queued while the user already picked
/// another track, so only advance if the player is stopped on the playlist's current track.
fn on_ended(
    player: &mut Player,
    ended_gen: u64,
    playlist: &mut Option<Playlist>,
    art: &mut Option<Cover>,
    send: &dyn Fn(Event),
) -> Result<(), PlayerError> {
    let Some(pl) = playlist else { return Ok(()) };
    let snap = player.snapshot();
    let cur = pl.current().map(|i| pl.album().tracks[i].path.as_path());
    let track = snap.track.as_ref().map(|t| t.path.as_path());
    if !should_advance(ended_gen, player.generation(), snap.status, track, cur) {
        return Ok(());
    }
    match pl.advance().map(Path::to_path_buf) {
        Some(p) => load_track(player, &p, pl.album().cover.as_ref(), art, send, true),
        None => Ok(()), // last track: stay stopped
    }
}

fn panic_message(p: &(dyn std::any::Any + Send)) -> String {
    p.downcast_ref::<&str>()
        .map(|s| s.to_string())
        .or_else(|| p.downcast_ref::<String>().cloned())
        .unwrap_or_else(|| "unknown".into())
}

/// `sounds` remembers every key sound loaded successfully (name -> path) so the
/// main loop can reload them into a fresh Player after a panic reset.
/// One unit of main-loop work after input parsing.
enum Work {
    Cmd(Command),
    Ended(u64),
}

fn dispatch(
    player: &mut Player,
    sounds: &mut HashMap<String, String>,
    playlist: &mut Option<Playlist>,
    art: &mut Option<Cover>,
    send: &dyn Fn(Event),
    cmd: Command,
) -> Result<(), PlayerError> {
    match cmd {
        Command::Load { path } => {
            if playlist.take().is_some() {
                send(Event::Playlist { album: None });
            }
            load_track(player, Path::new(&path), None, art, send, false)
        }
        // Scanning blocks this thread briefly (tags, durations); acceptable for one album.
        Command::LoadAlbum { path } => {
            let mut pl = Playlist::new(scan_album(Path::new(&path))?);
            send(Event::Playlist { album: Some(WireAlbum::from(pl.album())) });
            let first = pl.select(0).map(Path::to_path_buf);
            let cover = pl.album().cover.clone();
            *playlist = Some(pl);
            match first {
                Some(p) => load_track(player, &p, cover.as_ref(), art, send, true),
                None => Ok(()),
            }
        }
        Command::PlayIndex { index } => {
            let pl = playlist.as_mut().ok_or_else(|| invalid_state("no album loaded"))?;
            let path = pl.select(index).map(Path::to_path_buf).ok_or_else(|| invalid_state("track index out of range"))?;
            let cover = pl.album().cover.clone();
            load_track(player, &path, cover.as_ref(), art, send, true)
        }
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
            match player.load_sound(&name, Path::new(&path)) {
                Ok(()) => {
                    sounds.insert(name, path);
                }
                Err(e) => eprintln!("engine-sidecar: sound {name:?} not loaded: {}", e.message),
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
    let mut sounds: HashMap<String, String> = HashMap::new();

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
    let (itx, irx) = mpsc::channel::<Input>();
    spawn_forwarder(player_events, tx.clone(), itx.clone());
    spawn_reader(itx.clone());
    let mut playlist: Option<Playlist> = None;
    let mut art: Option<Cover> = None;

    while let Ok(input) = irx.recv() {
        let work = match input {
            Input::Eof => break,
            Input::Bad(reason) => {
                send(Event::bad_message(reason));
                continue;
            }
            Input::Line(line) => match parse_command(&line) {
                Ok(c) => Work::Cmd(c),
                Err(reason) => {
                    log_bad_line(&reason, &line);
                    send(Event::bad_message(reason));
                    continue;
                }
            },
            Input::Ended(g) => Work::Ended(g),
        };
        let outcome = catch_unwind(AssertUnwindSafe(|| match work {
            Work::Cmd(cmd) => dispatch(&mut player, &mut sounds, &mut playlist, &mut art, &send, cmd),
            Work::Ended(g) => on_ended(&mut player, g, &mut playlist, &mut art, &send),
        }));
        match outcome {
            Ok(Ok(())) => {}
            Ok(Err(e)) => send(e.into()),
            Err(p) => {
                send(Event::Error {
                    code: WireErrorCode::Internal,
                    message: format!("engine panic: {}", panic_message(&*p)),
                });
                if playlist.take().is_some() {
                    send(Event::Playlist { album: None });
                }
                publish_art(&mut art, None, &send);
                // The player may be left half-updated (locks, streams), so discard it
                // and start fresh rather than trust it; announce the fresh state.
                let old = std::mem::replace(&mut player, {
                    let (p, ev) = Player::new();
                    spawn_forwarder(ev, tx.clone(), itx.clone());
                    p
                });
                let _ = catch_unwind(AssertUnwindSafe(move || drop(old)));
                // main sends loadSound only once per process start, so the fresh player
                // must get the remembered key sounds back here. Logged only, never sent
                // as events; wrapped so a panic here cannot kill the sidecar.
                let _ = catch_unwind(AssertUnwindSafe(|| {
                    for (name, path) in &sounds {
                        if let Err(e) = player.load_sound(name, Path::new(path)) {
                            eprintln!("engine-sidecar: sound {name:?} not loaded: {}", e.message);
                        }
                    }
                }));
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

    #[test]
    fn should_advance_only_for_current_generation_and_track() {
        let a = Path::new("a.flac");
        let b = Path::new("b.flac");
        assert!(should_advance(3, 3, Status::Stopped, Some(a), Some(a)));
        assert!(!should_advance(2, 3, Status::Stopped, Some(a), Some(a)));
        assert!(!should_advance(3, 3, Status::Playing, Some(a), Some(a)));
        assert!(!should_advance(3, 3, Status::Stopped, Some(a), Some(b)));
        assert!(!should_advance(3, 3, Status::Stopped, None, Some(a)));
    }

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
