# Architecture

Cassette Player: Retro is a desktop music player with a cassette-tape UI. Phase 1 is a minimal player: open an audio file, then play, pause, stop, and seek with the buttons. The audio engine is written in Rust and runs as a separate process. The UI is Electron with React and TypeScript.

## Process model

Three kinds of process run while the app is open:

- **Electron main process.** Creates and owns the three windows: the player, the playlist window and the album-art window. The last two are created at launch and act as satellites of the player, with shared behaviour: frameless, close hides, and bounds saved in `settings.json`. It shows the native file dialog, spawns and supervises the engine sidecar, and forwards every engine event to each live window. It forwards only renderer commands that pass validation, and only from the player or playlist window (`app/src/main/ndjson.ts`; see `docs/PROTOCOL.md`).
- **Renderer processes.** One per window, each a React UI. They send commands and render the state they receive. They hold no authoritative state.
- **Engine sidecar.** A separate Rust process (`engine-sidecar`). It decodes, processes, and outputs audio. It talks to the main process over stdin and stdout using newline-delimited JSON.

A preload script runs between main and renderer. It exposes a small typed API (`window.retro`) through `contextBridge`. The renderer has `contextIsolation: true`, `sandbox: true` and `nodeIntegration: false`, so it cannot spawn processes or read files. The preload is built as CommonJS (`.cjs`), because sandboxed renderers cannot load ESM preloads.

Because audio lives in the engine process, playback keeps going if the renderer freezes or crashes. The UI can reconnect to the same state when it recovers.

The main process also owns the windows and their settings. The player window is resizable and keeps the composition's 767:616 aspect ratio. The renderer scales the fixed composition to fit, so the artwork looks the same at any size. No window goes full screen or maximizes. All three are `maximizable: false` and `fullscreenable: false`, and a `maximize` event is undone at once, since Linux ignores `maximizable: false`. Double-clicking does nothing on any window. Only a side window's minimize button rolls it up or down. All three windows are transparent, and each view clips itself to its artwork's corner radius. The playlist window is frameless, with its own artwork chrome, and closing it hides it. It is not user-resizable: it always matches the player's height, and its width comes from its design aspect ratio. Each side window has exactly one drag region, a childless strip in its top bar left of minimize and close. Nothing else in those views sets `-webkit-app-region`, and `app/test/dragRegions.test.ts` enforces that. The player body is the drag region, and its controls are no-drag. The album-art window is frameless, the same height as the player, and drawn from the artist's layers in `assets/ui/source/album cover deck/`. It is open from launch and shows the current track's cover, or an empty panel when there is none. Closing it hides it until the next launch.

The rules every window must follow are in `docs/WINDOWS.md`.

Docking: any window docks to any side (left, right, top, bottom) of any other window, and windows docked to a window follow it, so everything docked to the player, directly or through a chain, moves with it. By default the album-art window docks to the player's left and the playlist to its right. A window dropped within 12 px of another's edge snaps flush, with its start edge aligned if that is within 12 px too. Dragging a side window tears it off its dock, and windows docked to it come along. Dropping the player near a loose window snaps the player and picks the window up. The docks are kept in memory as a tree rooted at the player (`Dock { to, side, ratio }`, where the ratio is the offset along the shared edge) and are rebuilt from the geometry after every drop and at startup from the saved positions, so a layout survives a restart. Side windows keep the player's height, and a shaded window stays docked while windows docked below it move up. A detached window saved over the player is docked back to its default side. When a side window is shown, the player's group is nudged onto the screen unless that would push the player onto a loose window. The geometry (snap, inferDocks, layout, subtree, fitGroup) lives in `app/src/main/dock.ts`, a pure module with unit tests in `app/test/dock.test.ts`. Per-OS details: Windows and X11 send move events during a drag, and docked windows follow them live. Pure moves use `setPosition`, because `setBounds` can drift the size at fractional scaling on Windows. macOS sends no move events until a drag ends, so there the player's docked windows become its child windows and the window server carries them. Native Wayland gives apps no window positions, so on a Wayland session with XWayland the app relaunches itself once with `--ozone-platform=x11` (`app/src/main/platform.ts`; an AppImage relaunches its `$APPIMAGE` file). `pnpm dev` passes the flag directly, because a relaunch would end electron-vite. Under X11, KWin leaves a restored window flagged minimized and pins a fixed window's minimum size to its size, so a side window minimized by the OS is re-shown instead of restored, and the shade sets its minimum size while the window is briefly resizable. Move and resize events are matched against every position the app set or left in the last second, so late or two-step X11 events are not read as drags. A docked window is torn off only if it is still away from its dock 50 ms later, because openbox briefly reports (0,0) while reparenting. A side window minimized by macOS is restored with retries, because a restore during the minimize animation can be dropped. `scripts/e2e/dock.mjs` (run by `.github/workflows/dock-e2e.yml` on Linux, Windows and macOS) checks all of this live, including a real OS pointer drag. The app has one taskbar/Dock icon: side windows skip the taskbar and, on Windows and Linux, are always child windows of the player (owned windows on Windows, transient windows on X11; KWin ignores `skipTaskbar` for XWayland windows), so activating the player from the taskbar raises them with it. On macOS the Dock shows one icon per app, and a Dock click activates the app (`activate` restores and focuses the player). The dock E2E checks the single taskbar entry (Linux) and that activating the player brings every window above another window (all three OSes). Closing the player saves the other windows' bounds, then closes them. Main keeps `settings.json` in the user-data folder with the player's window state, the playlist window's state (`playlistWindow`), the album-art window's state (`albumWindow`), the last Open folder and a `layoutVersion`. A file with an older or missing version has its three window states dropped once (see `app/src/main/windowSize.ts`). It writes the file atomically, and the renderer never reads or writes it.

```
 Renderer (React)            Electron main               Engine sidecar (Rust)
 ----------------            -------------               ---------------------
 renders state    -- IPC -->  write command  -- stdin -->  stdin reader
 sends commands   <-- IPC --  forward event  <-- stdout --  event writer
                                                              |
                                                              v
                                                    player-core (Player)
                                                    decoder -> DSP -> resample
                                                              -> channel map -> ring buffer
                                                                                    |
                                                                                    v
                                                                          cpal callback -> sound card
```

## Engine crates

The engine is a Cargo workspace in `engine/`.

- **`player-core`** (library). Pure Rust, with no Electron, stdio, or UI code. It can be reused later in iOS and Android apps. It contains:
  - `state`: the transport state machine (`Empty -> Stopped -> Playing <-> Paused`) and seek clamping. Pure logic, no I/O.
  - `decode`: opens files and decodes them with `symphonia`.
  - `dsp`: the DSP chain, an explicit list of stages between decoder and output. The chain is empty in Phase 1. An equalizer can be added later as a stage without restructuring the pipeline.
  - `resample`: converts the file's sample rate to the device rate with `rubato`. It passes audio through when the rates are equal.
  - `output`: opens the default output device with `cpal`, reads from the ring buffer in the audio callback, and provides atomics for position. It also provides the acknowledged clear described below.
  - `sound`: short UI sounds (key clicks, and the tape-motor loop). Each is decoded fully into memory once, then converted to the device's rate and channels on first use. A sound can loop until it is stopped.
  - `player`: ties the parts together. It accepts commands and emits events. Each opened output gets one `player-worker` thread.
  - `album`: `scan_album` reads one folder (not recursively) and its tags and cover art. `track_cover` returns one track's cover for the `artwork` event. `Playlist` is the queue (the current index and advance), with no I/O.
- **`engine-sidecar`** (binary). A thin wrapper. It reads commands from stdin, passes them to `player-core`, and writes events to stdout. It holds the current `Playlist` and advances it when a track ends. After each successful load it sends `artwork`, and only when the cover changes. It contains the protocol types and no audio logic. If a command panics inside the player, the sidecar reports `internal`, resets the player, and loads the key sounds again on the new one.

The sidecar binary is built to `engine/target/debug/engine-sidecar` in development. The Electron main process uses that path. The environment variable `RETRO_SIDECAR` overrides it.

## Audio pipeline

Samples are processed in `f32` and never pass through JavaScript.

1. The decoder reads packets from the file and produces interleaved `f32` samples.
2. The DSP chain runs on the samples (no stages in Phase 1).
3. The resampler converts the rate if the file's rate differs from the device's native rate.
4. The channel map adjusts the channel count to the output device.
5. The samples are written into a lock-free single-producer, single-consumer ring buffer (`rtrb`) of 96,000 device frames.
6. The `cpal` output callback reads from the ring buffer and writes to the device. When paused, stopped, or short of data, it writes silence.

### Seek, stop and load: acknowledged clear

Dropping buffered audio cannot be a plain "clear" flag. Samples refilled after the flag was set can be dropped too, and the frame counter then drifts. So `seek`, `stop` and `load` use an acknowledged clear:

1. The player requests a clear on the output.
2. It waits until the audio callback confirms it has drained the ring.
3. It resets the frame counter to the new position, then refills the ring from the decoder.

This prevents stale audio after a seek and keeps the reported position in step with what is heard.

### Key sounds

The keys' click sounds go through the engine too, never through Web Audio or `<audio>`. The main process sends `loadSound` once per sound after the engine starts (the files are `assets/audio/` in dev and `resources/sounds/` in a packaged build). The renderer sends `playSound` by name when a key is pressed. While a forward or rewind hold runs, it sends `playSound` with `loop: true` for the tape motor, and `stopSound` when the hold ends. The main process sends `stopSound motor` when the player window's renderer closes, crashes or reloads.

A key sound is a `Clip`: an `Arc<[f32]>` already in the device's format. `Output::play_clip`, `Output::loop_clip` and `Output::stop_clip` send a `Cmd` (`Play`, `Loop` or `Stop`) to the audio callback through a second small `rtrb` ring. A loop restarts at 0 when it ends. A second loop of a clip that is already looping is ignored, and a stop ends every voice of that clip. After writing the music (or silence), the callback adds up to 4 voices on top (looping voices count too) and clamps the sum. Sounds play in every state, also while paused, stopped or empty, and they don't move the frame counter, so the position stays exact. The player keeps its own reference to every clip until the stream is gone, so the callback dropping a finished clip never frees memory. Clips are converted to the device format when the output opens, or when a sound is loaded after that, so the first key press does no resampling. A clip replaced by a new `loadSound` is kept in a retired list until the stream is gone.

## Threads

| Thread | Owner | Job |
|---|---|---|
| Stdin reader thread | `engine-sidecar` | Reads NDJSON lines from stdin (raw bytes, 1 MiB cap) and sends each one to the main loop's input channel. Stdin EOF ends it. |
| Sidecar main thread | `engine-sidecar` | Takes one input channel that carries command lines and `Ended` signals. Parses the lines, drives `Player` and the `Playlist`, and turns each `Err` into an `error` event. Bad lines are answered with `bad_message`. |
| Forwarder thread | `engine-sidecar` | One per `Player`. Converts `PlayerEvent` values into protocol events and queues them for the writer. It also sends `Ended` to the main loop's input channel, tagged with the load generation, so the playlist advances only on the current track's end (a stale `Ended` is ignored). |
| Writer thread | `engine-sidecar` | The only code that touches stdout. It writes and flushes one line per event, so lines never interleave. |
| `player-worker` thread | `player-core` | One per opened output. Owns the decoder, the DSP chain (empty in Phase 1), the resampler and the ring buffer producer. It decodes ahead into the ring, emits position events about every 50 ms while playing, and detects end of track once the ring has drained. |
| cpal audio callback | `cpal` (OS audio thread) | Reads only from the ring buffer and writes to the device. It does not allocate, lock, log, or block. Shared values go through atomics. |

The control side (`Player`, on the caller's thread) changes the transport state and waits for the worker's reply when the result matters (load, seek, stop). It never holds the shared lock while waiting for the worker.

The audio callback is the only real-time thread. Anything that could block (file I/O, decoding, logging, locks) stays on the other threads.

## Data flow

### One command: the user clicks play

1. The renderer calls `window.retro.send({ v: 1, type: "play" })`.
2. The preload forwards it on the `engine:command` IPC channel.
3. The main process writes one JSON line to the sidecar's stdin.
4. The sidecar's main thread parses the line and calls `Player::play()`.
5. The player calls `Transport.play()`, which moves the state to `Playing`, and tells the output to start.
6. The player builds a `State` snapshot and sends it through the forwarder thread to the writer thread.
7. The writer thread writes one JSON line to stdout.
8. The main process reads the line, parses it, and forwards it on the `engine:event` channel.
9. The renderer updates its store from the event. The reels start to rotate because the status is now `playing`.

### One event: a position tick

1. The `player-worker` thread reads the output's frame counter.
2. It sends `Position { positionMs }` to the forwarder about every 50 ms while playing.
3. The writer thread writes `{"v":1,"type":"position",...}` to stdout.
4. Main forwards it to the renderer, which updates the displayed time. Between events the renderer may smooth the displayed position, but it keeps no separate clock.

### Album import and auto-advance

1. A renderer sends `loadAlbum {path}`. The path comes from the folder dialog or a folder drop.
2. Main validates the command and writes it to the sidecar.
3. The sidecar scans the folder with `scan_album`. On error it sends `error` and leaves the playlist as it was.
4. On success it sends `playlist {album}`, selects track 1, then loads and plays it.
5. Main caches the `playlist` event, shows the playlist window, and sends the event to each window.
6. When a track ends, the forwarder sends `Ended`. The sidecar advances the `Playlist` and plays the next track. The advance is guarded, so a stale `Ended` cannot skip a track the user just picked. After the last track the player stops.

The current track is not an event. Each window matches `state.trackInfo.path` against the album's track paths to mark the current row.

### Artwork

1. After every successful track load (single file, album, `playIndex`, or auto-advance), the sidecar picks the cover of the current track: its embedded picture, else a folder image, else the album cover, else none. A failed load counts as none.
2. It sends an `artwork` event only when that cover differs from the last one sent. An album with one shared cover is therefore sent once.
3. Main caches the event and sends it to each window. The album-art window shows the cover, or an empty panel when `cover` is `null`.

## Supervision and errors

- Errors are events. The engine reports them as `error` messages and never panics on bad files, missing devices, or bad input.
- If the sidecar exits unexpectedly, the main process restarts it with backoff, from 0.5 s up to 8 s. The backoff resets after the sidecar has been up for 10 s. The main process also sends the renderer an `error` with code `engine_crashed`. This is the only code the main process emits.
- The main process caches the last `state`, `playlist` and `artwork` events, and re-sends them when a window reloads. If the engine goes down while a cover is cached, main clears it and sends `artwork` with `cover` `null`, so the album-art window shows an empty panel.
- On quit, the main process ends the sidecar's stdin and then kills the process.
- Protocol details are in `docs/PROTOCOL.md`.

## Renderer and future windows

The renderer holds no authoritative state. Its store is an external store that is filled only from engine events. Each window is a self-contained React view that reads from that store and sends commands. The player, playlist and album-art windows therefore show the same state from the same events.

The renderer's pieces:

- Hooks: `useEngine` (store and commands), `useDisplayPosition` (smooths the displayed position between `position` events, with no separate clock), `useSeekHold` (repeats seeks while a button is held), `useKeyboard` and `useFileDrop`.
- Views: `CassettePlayer` (the default view), `PlaylistView` (opened with the URL hash `#playlist`, in the playlist window), `AlbumView` (`#album`, in the album-art window) and `DebugPlayer` (a plain view, opened with the URL hash `#debug`).
- Reels: rotate with `requestAnimationFrame`, writing CSS transforms. They ease to a stop when playback stops or pauses.

## Phase 1 status

Phase 1 features are built. The automated checks pass, and the renderer-freeze test passed: a 3 s busy loop in the renderer advanced the engine position by about 3.3 s. Still open: the manual check that a FLAC, a WAV and an MP3 each play correctly (only WAV was exercised automatically), Unsigned test bundles are built by `pnpm package` (host OS) and the `package` CI workflow (all three OSes). A packaged app runs the release sidecar from its resources folder; dev runs `engine/target/debug/engine-sidecar`. See `docs/ROADMAP.md` for the checklist.
