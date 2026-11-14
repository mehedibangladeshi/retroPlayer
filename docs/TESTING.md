# Installing a test build

Test builds are unsigned, so each OS warns before the first run. Bundles come from the `package` workflow in GitHub Actions (download the artifact for your OS), or from a draft release.

## Linux (x64)

- **AppImage:** `chmod +x Cassette-Player-Retro-*.AppImage`, then run it. If it says FUSE is missing, install `libfuse2` (Ubuntu: `sudo apt install libfuse2t64`, or `libfuse2` on 22.04), or run it with `--appimage-extract-and-run`.
- **tar.gz:** extract it and run `./cassette-player-retro`.
- Needs glibc 2.34 or newer (Ubuntu 22.04+, Fedora 35+, Debian 12+) and ALSA (`libasound2`), which desktop distros already have.

## Windows (x64)

- **Installer:** run `Cassette-Player-Retro-*-win-x64.exe`. SmartScreen will say "Windows protected your PC": click **More info**, then **Run anyway**.
- **Zip:** extract it and run `Cassette Player Retro.exe`.

## macOS (Apple Silicon: `arm64`, Intel: `x64`)

1. Open the `.dmg` and drag Cassette Player Retro into Applications.
2. The first open is blocked ("cannot be opened" or "is damaged"). Fix it with either:
   - **System Settings → Privacy & Security**, scroll down, click **Open Anyway**; or
   - in Terminal: `xattr -cr "/Applications/Cassette Player Retro.app"`
3. Open it again.

## Settings and reset

The app saves its window sizes and positions, last Open folder and last session (track and position) in `settings.json`. The file is in the app's user-data folder:

- Linux: `~/.config/Cassette Player Retro/`
- Windows: `%APPDATA%\Cassette Player Retro\`
- macOS: `~/Library/Application Support/Cassette Player Retro/`

To reset these to defaults, quit the app and delete `settings.json`. To reset only the window layout, right-click the player and pick **Windows → Reset Windows**.

## What to test

Follow the checklist in the hand-off message, or in short: open a FLAC, a WAV and an MP3 (click the cassette, use Ctrl/Cmd+O, or drag a file onto the window); try play, pause, stop, rewind and forward (click and hold); check the reels spin only while playing; try a broken file; quit while a song plays, reopen, and check it comes back on the same song and time and that Play resumes there. Note your OS and version with any report.

Windows (right-click the player for the menu): on a small laptop screen (1366x768 or 1280x720), and on a second monitor if you have one, check that every window fits and can be made smaller and larger; that **Windows → Reset Windows** brings back all five windows docked in their default places; that dragging a window edge close to another window's edge snaps them flush, so you can tile the windows into a rectangle (also with two or three windows closed); and that **Windows → Fill Gaps** grows the playlist or cassette rack into an empty gap. Then move a window to the other monitor, or change the screen resolution or scaling while the app runs, and check the windows shrink to fit the smaller screen and stay docked. This last part is only tested automatically with a faked smaller screen.
