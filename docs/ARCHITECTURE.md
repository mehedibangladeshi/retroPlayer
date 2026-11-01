# Architecture

Cassette Player: Retro is a desktop music player with a cassette-tape UI. Phase 1 is a minimal player: open an audio file, then play, pause, stop, and seek with the buttons. The audio engine is written in Rust and runs as a separate process. The UI is Electron with React and TypeScript.

## Process model

Three kinds of process run while the app is open:

- **Electron main process.** Creates the window, shows the native file dialog, spawns and supervises the engine sidecar, and forwards messages between the sidecar and the renderer.
- **Renderer process.** The React UI. It sends commands and renders the state it receives. It holds no authoritative state.
- **Engine sidecar.** A separate Rust process (`engine-sidecar`). It decodes, processes, and outputs audio. It talks to the main process over stdin and stdout using newline-delimited JSON.

A preload script runs between main and renderer. It exposes a small typed API (`window.retro`) through `contextBridge`. The renderer has `contextIsolation: true`, `sandbox: true` and `nodeIntegration: false`, so it cannot spawn processes or read files. The preload is built as CommonJS (`.cjs`), because sandboxed renderers cannot load ESM preloads.

Because audio lives in the engine process, playback keeps going if the renderer freezes or crashes. The UI can reconnect to the same state when it recovers.

The main process also owns the window and its settings. The window is resizable and keeps the composition's 767:616 aspect ratio. The renderer scales the fixed composition to fit, so the artwork looks the same at any size. Full screen is toggled with F11 (Ctrl+Cmd+F on macOS) or by double-clicking the drag region, and Esc leaves it. Main keeps `settings.json` in the user-data folder with the window state and the last Open folder. It writes the file atomically, and the renderer never reads or writes it.

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
  - `player`: ties the parts together. It accepts commands and emits events. Each opened output gets one `player-worker` thread.
- **`engine-sidecar`** (binary). A thin wrapper. It reads commands from stdin, passes them to `player-core`, and writes events to stdout. It contains the protocol types and no audio logic. If a command panics inside the player, the sidecar reports `internal` and resets the player.

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

## Threads

| Thread | Owner | Job |
|---|---|---|
| Sidecar main thread | `engine-sidecar` | Reads NDJSON lines from stdin (raw bytes, 1 MiB cap), parses them, drives `Player`, and turns each `Err` into an `error` event. Bad lines are answered with `bad_message`. Stdin EOF ends the loop. |
| Forwarder thread | `engine-sidecar` | One per `Player`. Converts `PlayerEvent` values into protocol events and queues them for the writer. |
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

## Supervision and errors

- Errors are events. The engine reports them as `error` messages and never panics on bad files, missing devices, or bad input.
- If the sidecar exits unexpectedly, the main process restarts it with backoff, from 0.5 s up to 8 s. The backoff resets after the sidecar has been up for 10 s. The main process also sends the renderer an `error` with code `engine_crashed`. This is the only code the main process emits.
- The main process caches the last `state` and re-sends it when the renderer reloads.
- On quit, the main process ends the sidecar's stdin and then kills the process.
- Protocol details are in `docs/PROTOCOL.md`.

## Renderer and future windows

The renderer holds no authoritative state. Its store is an external store that is filled only from engine events. The player view is a self-contained React component that reads from that store and sends commands. Because of this, a future second window can show the same state without changes to the engine. Phase 1 has one window.

The renderer's pieces:

- Hooks: `useEngine` (store and commands), `useDisplayPosition` (smooths the displayed position between `position` events, with no separate clock), `useSeekHold` (repeats seeks while a button is held), `useKeyboard` and `useFileDrop`.
- Views: `CassettePlayer` (the default view) and `DebugPlayer` (a plain view, opened with the URL hash `#debug`).
- Reels: rotate with `requestAnimationFrame`, writing CSS transforms. They ease to a stop when playback stops or pauses.

## Phase 1 status

Phase 1 features are built. The automated checks pass, and the renderer-freeze test passed: a 3 s busy loop in the renderer advanced the engine position by about 3.3 s. Still open: the manual check that a FLAC, a WAV and an MP3 each play correctly (only WAV was exercised automatically), Unsigned test bundles are built by `pnpm package` (host OS) and the `package` CI workflow (all three OSes). A packaged app runs the release sidecar from its resources folder; dev runs `engine/target/debug/engine-sidecar`. See `docs/ROADMAP.md` for the checklist.
