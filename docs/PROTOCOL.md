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

Mixes the sound loaded under `name` on top of the music, in any state (also `Empty`, `Stopped` and `Paused`). It never changes the transport and emits no event. Up to 4 sounds can overlap; a fifth is skipped.

Fields: `name` (string).

```json
{"v":1,"type":"playSound","name":"stop"}
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

### error

Reports a failure. Errors are events, never crashes. The engine keeps running after sending one.

Fields: `code` (one of the error codes below), `message` (string, human-readable, may be shown in the UI).

```json
{"v":1,"type":"error","code":"file_not_found","message":"File not found: /home/user/Music/missing.mp3"}
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
- If the engine panics while handling a command, it emits `error` with code `internal` and a message starting with `engine panic:`. It then resets the player and emits a fresh `state` (empty).
- The audio device is opened on the first `load` or `playSound`. With no device, `load` fails with `no_output_device` and nothing else changes.
- `loadSound` and `playSound` never produce events, including `error`: a missing file, an unknown name or no audio device is logged to stderr only, so a key sound can't put an error message in front of the user. A sound that can't play is skipped.

## Changing the protocol

1. Update this file first. Describe the message, its fields, and its behaviour, and add one JSON example per message.
2. Update the Rust types in `engine/crates/engine-sidecar`.
3. Update the TypeScript types in `app/src/shared/protocol.ts`.
4. Bump `"v"` on any breaking change (removing or renaming a field or tag, or changing its meaning).

The Rust tests parse every ```` ```json ```` example in this file and round-trip it through the Rust types. Each example must be exactly one single-line JSON object.
