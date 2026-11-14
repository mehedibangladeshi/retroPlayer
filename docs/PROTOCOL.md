# Engine <-> UI protocol

This file is the source of truth for every message exchanged between the Electron app and the engine sidecar. To change the protocol, edit this file first (see "Changing the protocol" at the end).

## Transport

- Newline-delimited JSON (NDJSON) over the sidecar's stdin and stdout.
- Commands go from the UI to the engine on stdin. Events go from the engine to the UI on stdout.
- One JSON object per line. Encoding is UTF-8. Each line ends with `\n`.
- stderr is for logs only. Nothing other than events is written to stdout.

## Envelope

Every message has these fields:

- `"v": 1`: the protocol version. Messages with any other `v` are treated as `bad_message`.
- `"type"`: the message tag, for example `"play"` or `"state"`.

All keys are camelCase. Fields listed below are required unless marked as nullable.

## Commands (UI to engine)

### load

Loads the file at `path`, replacing any current track. The player ends in `Stopped`. The UI then sends `play`.

Fields: `path` (string, absolute path to the audio file).

```json
{"v":1,"type":"load","path":"/home/user/Music/song.flac"}
```

### play

Starts playback, or resumes it from `Paused`. Valid from `Stopped`, `Paused`, and (as an error) `Empty`.

```json
{"v":1,"type":"play"}
```

### pause

Holds the current position. Valid while `Playing`.

```json
{"v":1,"type":"pause"}
```

### stop

Halts playback and resets the position to 0. The player moves to `Stopped`.

```json
{"v":1,"type":"stop"}
```

### seek

Absolute seek. The target is clamped to `[0, durationMs]`.

Fields: `positionMs` (integer, milliseconds).

```json
{"v":1,"type":"seek","positionMs":30000}
```

### seekRelative

Seeks by `deltaMs` from the current position. The result is clamped to `[0, durationMs]`. The UI uses this for the forward and backward buttons (10 seconds per click, repeated while held).

Fields: `deltaMs` (integer, milliseconds, may be negative).

```json
{"v":1,"type":"seekRelative","deltaMs":-10000}
```

### loadSound

Decodes a short UI sound (a key click) into memory under `name`, replacing any sound already loaded under that name. Only the Electron main process sends it, once per sound after the engine starts; the renderer can't. It doesn't touch the audio device or the transport, and emits no event. At most the first 10 seconds of the file are kept.

Fields: `name` (string), `path` (string, absolute path to the audio file).

```json
{"v":1,"type":"loadSound","name":"stop","path":"/opt/app/resources/sounds/stop_button.mp3"}
```

### playSound

Mixes the sound loaded under `name` on top of the music, in any state (also `Empty`, `Stopped` and `Paused`). It never changes the transport and emits no event. Up to 4 sounds can overlap; a fifth is skipped. An unknown `name` is ignored and logged.

Fields: `name` (string), `loop` (boolean, optional; absent or false plays the sound once, true repeats it until `stopSound`). A second looping `playSound` of a sound that is already looping is ignored.

```json
{"v":1,"type":"playSound","name":"stop"}
```

```json
{"v":1,"type":"playSound","name":"motor","loop":true}
```

### stopSound

Ends every voice of the sound `name` (a loop or a one-shot still playing). Stopping a sound that is silent is a no-op. It emits no event; an unknown `name` is ignored and logged.

Fields: `name` (string).

```json
{"v":1,"type":"stopSound","name":"motor"}
```

### loadAlbum

Loads a folder as an album. The engine scans the folder (sub-folders are not read) for files with the extensions `flac`, `wav`, `mp3`, `m4a`, `aac`, `ogg` and `oga` (any case). It orders the tracks by disc number, then track number, then file name, and reads their tags and cover art.

On success it emits `playlist` with the album, then loads track `index` and starts playing, so the usual `state` events follow. The UI does not send `play`. With `play` `false` the track is loaded and left in `Stopped`; the Electron main process uses this to restore the last session, then sends `seek` to the saved position.

On failure it emits `error`: `file_not_found` if the folder is missing or cannot be read, `unsupported_format` if it has no playable tracks. Any current album stays unchanged.

Fields: `path` (string, absolute path to the folder), `index` (optional integer, zero-based track to load first, default 0; out of range loads track 0), `play` (optional boolean, default `true`).

```json
{"v":1,"type":"loadAlbum","path":"/music/The Hunna - The Hunna (2022)","index":2,"play":false}
```

### playIndex

Loads and plays track `index` of the current album. `index` is zero-based. If there is no album, or `index` is out of range, the engine emits `error` with code `invalid_state`.

Fields: `index` (integer, zero-based position in the album's `tracks`).

```json
{"v":1,"type":"playIndex","index":2}
```

### setVolume

Sets the output volume. The engine clamps `volume` to `[0, 1]`. It maps the knob position to gain: `0` is silence; any other value gives `10^(2*(volume-1))`, so the low end is -40 dB and `1` is 0 dB. The gain applies to the whole output, including key sounds. Default `1`.

Fields: `volume` (number, knob position 0 to 1).

```json
{"v":1,"type":"setVolume","volume":0.6}
```

### setLoop

Loop Song. When on, a track that ends replays from the start instead of advancing to the next track. Manual `next` and `previous` are unaffected. Default off.

Fields: `on` (boolean).

```json
{"v":1,"type":"setLoop","on":true}
```

### setShuffle

Shuffle. When on, the play order becomes the current track first, then the remaining album tracks in random order. When off, the play order is the album order. `loadAlbum` with shuffle on reshuffles starting from the chosen index. Default off.

Fields: `on` (boolean).

```json
{"v":1,"type":"setShuffle","on":false}
```

### next

Goes to the next track in play order and plays it, like `playIndex`. Does nothing at the end of the play order, or when no album is loaded.

```json
{"v":1,"type":"next"}
```

### previous

Goes to the previous track in play order and plays it. On the first track of the play order, it restarts that track (seeks to 0). The UI decides "restart if more than 3 s in" before it sends `previous`; the engine does not check the position.

```json
{"v":1,"type":"previous"}
```

## Events (engine to UI)

### state

Full snapshot of the player. Sent on startup and after every state transition.

Fields:
- `status`: one of `"empty"`, `"stopped"`, `"playing"`, `"paused"`.
- `positionMs`: integer, milliseconds. Always 0 while `Empty`.
- `durationMs`: integer, milliseconds, or `null` when unknown or no track is loaded.
- `trackInfo`: object or `null` (`null` while `Empty`).

`trackInfo` fields: `title` (string, display title), `path` (string), `codec` (string, short codec name such as `FLAC`), `sampleRate` (integer, Hz), `channels` (integer).

```json
{"v":1,"type":"state","status":"playing","positionMs":12340,"durationMs":185000,"trackInfo":{"title":"song","path":"/home/user/Music/song.flac","codec":"FLAC","sampleRate":44100,"channels":2}}
```

### position

Playback position. Sent about 20 times per second (roughly every 50 ms) while `Playing`. Not sent in other states.

Fields: `positionMs` (integer, milliseconds).

```json
{"v":1,"type":"position","positionMs":12360}
```

### ended

Sent when the track reaches its end. It is followed by a `state` event with `status` `"stopped"` and `positionMs` 0.

```json
{"v":1,"type":"ended"}
```

When a track ends and an album is active, the engine emits `ended`, then loads and plays the next track (its `state` and `position` events follow). After the last track it stays `stopped`, as above.

### error

Reports a failure. Errors are events, never crashes. The engine keeps running after sending one.

Fields: `code` (one of the error codes below), `message` (string, human-readable, may be shown in the UI).

```json
{"v":1,"type":"error","code":"file_not_found","message":"File not found: /home/user/Music/missing.mp3"}
```

### playlist

Carries the current album. It is sent after a successful `loadAlbum`. It is also sent with `album` `null` when a single-file `load` replaces an active album. The Electron main process forwards it to every window and re-sends the latest one to a window that (re)loads.

Fields: `album` (object or `null`):
- `dir` (string, absolute folder path), `title` (string or `null`), `artist` (string or `null`), `year` (string or `null`).
- `cover` (string or `null`): a `data:` URL of the cover art (`data:<mime>;base64,...`), or `null` when no art was found or it is larger than 8 MiB.
- `tracks` (array, in play order). Each track has `path` (string, absolute), `title` (string), `artist` (string or `null`), `trackNo` (integer or `null`) and `durationMs` (integer or `null`).

There is no "current track" field. The current track is the one whose `path` equals `state.trackInfo.path`.

```json
{"v":1,"type":"playlist","album":{"dir":"/music/Album","title":"The Hunna","artist":"The Hunna","year":"2022","cover":null,"tracks":[{"path":"/music/Album/01 Fugazi.flac","title":"Fugazi","artist":"The Hunna","trackNo":1,"durationMs":201000}]}}
```

```json
{"v":1,"type":"playlist","album":null}
```

### artwork

Carries the cover art of the current track. It is sent right after every successful track load (single `load`, `loadAlbum`, `playIndex`, auto-advance), before playback starts, and only when the art differs from the last one sent. The art is the file's embedded picture, else a folder image next to it, else the active album's cover, else `null`. A failed load counts as no art. The engine sends nothing at startup. The Electron main process caches the latest `artwork`, re-sends it to a window that (re)loads, and sends `null` if the engine restarts. The album-art window always exists: it shows the cover, or an empty panel when `cover` is `null`.

Fields: `cover` (string or `null`, always present): a `data:` URL (`data:<mime>;base64,...`), or `null` when there is no art.

```json
{"v":1,"type":"artwork","cover":"data:image/jpeg;base64,/9j/4AAQ"}
```

```json
{"v":1,"type":"artwork","cover":null}
```

### options

Carries the engine's playback options. It is emitted once when the engine starts, and after every `setVolume`, `setLoop` and `setShuffle`. The engine owns these values. The Electron main process saves them in `settings.json` and sends them back as commands at startup and after a sidecar restart.

Fields: `volume` (number, 0 to 1), `loop` (boolean), `shuffle` (boolean).

```json
{"v":1,"type":"options","volume":0.6,"loop":false,"shuffle":true}
```

### levels

Analysis of the real output, after volume is applied. It is sent with each `position` tick while `Playing` (about 20 Hz). Audio samples never reach the UI; only these numbers do. The UI fades the display to zero when no `levels` event has arrived for 150 ms.

Fields:
- `rms` (number, 0 to 1): overall RMS level.
- `peak` (number, 0 to 1): peak level.
- `bands` (array of 16 numbers, each 0 to 1): level of 16 log-spaced bands from 40 Hz to 16 kHz, dB-scaled.
- `wave` (array of 64 numbers, each -1 to 1): a downsampled mono waveform.

```json
{"v":1,"type":"levels","rms":0.42,"peak":0.81,"bands":[0.12,0.2,0.35,0.5,0.62,0.7,0.66,0.58,0.49,0.41,0.33,0.27,0.22,0.16,0.09,0.04],"wave":[0.0,0.12,0.25,0.37,0.48,0.58,0.67,0.74,0.8,0.85,0.88,0.9,0.91,0.9,0.88,0.85,0.8,0.74,0.67,0.58,0.48,0.37,0.25,0.12,0.0,-0.12,-0.25,-0.37,-0.48,-0.58,-0.67,-0.74,-0.8,-0.85,-0.88,-0.9,-0.91,-0.9,-0.88,-0.85,-0.8,-0.74,-0.67,-0.58,-0.48,-0.37,-0.25,-0.12,0.0,0.12,0.25,0.37,0.48,0.58,0.67,0.74,0.8,0.85,0.88,0.9,0.91,0.9,0.88,0.85]}
```

## Error codes

| Code | Meaning |
|---|---|
| `unsupported_format` | The file cannot be opened as a supported audio format. |
| `file_not_found` | The path given to `load` does not exist or cannot be read. |
| `no_output_device` | No audio output device is available. |
| `decode_error` | The file was recognized but decoding failed. |
| `invalid_state` | The command is not valid in the current state, for example `play` while `Empty`. |
| `bad_message` | A line is not valid JSON, has an unknown `type`, has missing or wrong fields, or has a `v` other than 1. |
| `internal` | An unexpected engine failure. |
| `engine_crashed` | The sidecar process exited unexpectedly. Emitted only by the Electron main process, never by the engine. |

## State machine

```
Empty --load--> Stopped --play--> Playing <--pause/play--> Paused
                   ^                 |                       |
                   |----stop---------+-----------stop--------+
```

- `Empty` to `Stopped`: `load` succeeds.
- `Stopped` or `Paused` to `Playing`: `play`.
- `Playing` to `Paused`: `pause`.
- `Playing` or `Paused` to `Stopped`: `stop`, which also resets the position to 0.
- Any state to `Stopped`: `load` replaces the track.
- `Playing` to `Stopped`: the track ends (`ended`, then `state` with `stopped`).

## Behaviour rules

- The engine emits a `state` event with `status` `"empty"` on startup.
- The engine emits a `state` event after every transition.
- `seek` and `seekRelative` clamp the target to `[0, durationMs]`. When `durationMs` is `null`, only the lower bound applies.
- `stop` resets `positionMs` to 0.
- `play` while `Empty` produces an `error` with code `invalid_state`.
- An unknown, malformed, or wrong-version line is logged to stderr and answered with an `error` with code `bad_message`. The engine never exits because of bad input.
- `pause` while `Empty` or `Stopped` produces an `error` with code `invalid_state`.
- `play` while `Playing` is a no-op. The engine re-emits `state`.
- `stop` while `Empty` is a no-op. The engine emits `state` with `status` `"empty"`, and the player stays empty.
- `seek` and `seekRelative` while `Empty` are ignored, and produce no event.
- After `ended`, or after an asynchronous `error`, `play` starts from position 0. A `seek` made after `ended` is kept, and the next `play` starts from that position.
- A seek lands on the nearest packet boundary at or before the target, so the position can be slightly earlier than requested. The `state` event after a seek carries the actual position.
- `positionMs` and `deltaMs` accept any JSON number. The engine rounds to the nearest integer, halves away from zero. A negative `positionMs` is treated as 0. The Electron main process also rounds before sending.
- A line that is not valid UTF-8, is longer than 1 MiB, is not JSON, has an unknown `type`, or has a `v` other than 1 is answered with `error` and code `bad_message`. The engine keeps running.
- If the engine panics while handling a command, it emits `error` with code `internal` and a message starting with `engine panic:`. It then resets the player, loads the key sounds again on the fresh player, and emits a fresh `state` (empty).
- The audio device is opened on the first `load` or `playSound`. With no device, `load` fails with `no_output_device` and nothing else changes.
- `loadSound` and `playSound` never produce events, including `error`: a missing file, an unknown name or no audio device is logged to stderr only, so a key sound can't put an error message in front of the user. A sound that can't play is skipped.
- The Electron main process forwards a renderer command only if it passes validation: `load` needs a path with a supported audio extension (`flac`, `wav`, `mp3`, `m4a`, `aac`, `ogg`, `oga`, any case), and `playSound` needs a known sound name. `loadSound` is sent by main only. `setVolume` needs a finite number, and `setLoop` and `setShuffle` need a boolean `on`. Main logs a dropped command and sends no reply.

## Changing the protocol

1. Update this file first. Describe the message, its fields, and its behaviour, and add one JSON example per message.
2. Update the Rust types in `engine/crates/engine-sidecar`.
3. Update the TypeScript types in `app/src/shared/protocol.ts`.
4. Bump `"v"` on any breaking change (removing or renaming a field or tag, or changing its meaning).

The Rust tests parse every ```` ```json ```` example in this file and round-trip it through the Rust types. Each example must be exactly one single-line JSON object.
