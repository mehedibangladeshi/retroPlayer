# Architecture

retroPlayer is a desktop music player with a cassette-tape UI. Phase 1 is a minimal player: open an audio file, then play, pause, stop, and seek with the buttons. The audio engine is written in Rust and runs as a separate process. The UI is Electron with React and TypeScript.

## Process model

Three kinds of process run while the app is open:

- **Electron main process.** Creates the window, shows the native file dialog, spawns and supervises the engine sidecar, and forwards messages between the sidecar and the renderer.
- **Renderer process.** The React UI. It sends commands and renders the state it receives. It holds no authoritative state.
- **Engine sidecar.** A separate Rust process (`engine-sidecar`). It decodes, processes, and outputs audio. It talks to the main process over stdin and stdout using newline-delimited JSON.

A preload script runs between main and renderer. It exposes a small typed API (`window.retro`) through `contextBridge`. The renderer has `contextIsolation: true` and `nodeIntegration: false`, so it cannot spawn processes or read files.

Because audio lives in the engine process, playback keeps going if the renderer freezes or crashes. The UI can reconnect to the same state when it recovers.

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
  - `output`: opens the default output device with `cpal`, reads from the ring buffer in the audio callback, and provides atomics for position.
  - `player`: ties the parts together. It accepts commands and emits events.
- **`engine-sidecar`** (binary). A thin wrapper. It reads commands from stdin, passes them to `player-core`, and writes events to stdout. It contains the protocol types and no audio logic.

The sidecar binary is built to `engine/target/debug/engine-sidecar` in development. The Electron main process uses that path. The environment variable `RETRO_SIDECAR` overrides it.

## Audio pipeline

Samples are processed in `f32` and never pass through JavaScript.

1. The decoder reads packets from the file and produces interleaved `f32` samples.
2. The DSP chain runs on the samples (no stages in Phase 1).
3. The resampler converts the rate if the file's rate differs from the device's native rate.
4. The channel map adjusts the channel count to the output device.
5. The samples are written into a lock-free single-producer, single-consumer ring buffer (`rtrb`).
6. The `cpal` output callback reads from the ring buffer and writes to the device. When paused, stopped, or short of data, it writes silence.

## Threads

| Thread | Owner | Job |
|---|---|---|
| Sidecar stdin reader | `engine-sidecar` | Reads NDJSON lines from stdin, parses them, and sends commands to the player thread. Bad lines are logged and answered with `bad_message`. |
| Player / decoder thread | `player-core` | Owns the transport state and the decoder. Handles commands, runs decode, DSP, resample, and channel mapping, and fills the ring buffer. Produces position ticks at about 20 Hz from the output's frame counter. |
| cpal audio callback | `cpal` (OS audio thread) | Reads from the ring buffer and writes to the device. It does not allocate, lock, log, or block. Shared values go through atomics. |
| Event writer | `engine-sidecar` | Receives `PlayerEvent` values and writes them to stdout as NDJSON. |

The audio callback is the only real-time thread. Anything that could block (file I/O, decoding, logging, locks) stays on the other threads.

## Data flow

### One command: the user clicks play

1. The renderer calls `window.retro.send({ v: 1, type: "play" })`.
2. The preload forwards it on the `engine:command` IPC channel.
3. The main process writes one JSON line to the sidecar's stdin.
4. The stdin reader parses the line and sends `Play` to the player thread.
5. The player calls `Transport.play()`, which moves the state to `Playing`, and tells the output to start.
6. The player builds a `State` snapshot and sends it to the event writer.
7. The event writer writes one JSON line to stdout.
8. The main process reads the line, parses it, and forwards it on the `engine:event` channel.
9. The renderer updates its store from the event. The reels start to rotate because the status is now `playing`.

### One event: a position tick

1. The player thread reads the output's frame counter.
2. It sends `Position { positionMs }` to the event writer about every 50 ms while playing.
3. The event writer writes `{"v":1,"type":"position",...}` to stdout.
4. Main forwards it to the renderer, which updates the displayed time. Between events the renderer may smooth the displayed position, but it keeps no separate clock.

## Supervision and errors

- Errors are events. The engine reports them as `error` messages and never panics on bad files, missing devices, or bad input.
- If the sidecar exits unexpectedly, the main process restarts it with backoff and sends the renderer an `error` with code `engine_crashed`. This is the only code the main process emits.
- Protocol details are in `docs/PROTOCOL.md`.

## Renderer and future windows

The renderer holds no authoritative state. It has a store that is filled only from engine events. The player view is a self-contained React component that reads from that store and sends commands. Because of this, a future second window can show the same state without changes to the engine. Phase 1 has one window.

## Phase 1 status

Phase 1 is in progress. See `docs/ROADMAP.md` for the scope and the acceptance checklist.
