import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { resolve } from 'node:path'
import { app, type BrowserWindow } from 'electron'
import { IPC } from '@shared/api'
import { PROTOCOL_VERSION, type Command, type EngineEvent } from '@shared/protocol'
import { LineSplitter, parseEvent } from './ndjson'

const BACKOFF_MIN_MS = 500
const BACKOFF_MAX_MS = 8000
const STABLE_UPTIME_MS = 10_000
const KILL_AFTER_MS = 1000

// TODO(packaging): resolve the bundled sidecar from process.resourcesPath when packaged.
function sidecarPath(): string {
  return (
    process.env.RETRO_SIDECAR ??
    resolve(app.getAppPath(), '../engine/target/debug/engine-sidecar' + (process.platform === 'win32' ? '.exe' : ''))
  )
}

export class Sidecar {
  private child: ChildProcessWithoutNullStreams | null = null
  private quitting = false
  private backoff = BACKOFF_MIN_MS
  private restartTimer: NodeJS.Timeout | null = null
  private lastState: EngineEvent | null = null

  constructor(private readonly getWindow: () => BrowserWindow | null) {}

  start(): void {
    if (this.quitting || this.child) return
    const path = sidecarPath()
    const startedAt = Date.now()
    let handled = false
    const onDown = (message: string): void => {
      if (handled) return
      handled = true
      this.child = null
      if (this.quitting) return
      if (Date.now() - startedAt >= STABLE_UPTIME_MS) this.backoff = BACKOFF_MIN_MS
      this.emit({ v: PROTOCOL_VERSION, type: 'error', code: 'engine_crashed', message })
      this.lastState = null
      this.restartTimer = setTimeout(() => {
        this.restartTimer = null
        this.start()
      }, this.backoff)
      this.backoff = Math.min(this.backoff * 2, BACKOFF_MAX_MS)
    }

    let child: ChildProcessWithoutNullStreams
    try {
      child = spawn(path, [], { stdio: 'pipe', shell: false })
    } catch (err) {
      onDown(`engine failed to start: ${String(err)}`)
      return
    }
    this.child = child

    const splitter = new LineSplitter()
    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => {
      for (const line of splitter.push(chunk)) {
        const evt = parseEvent(line)
        if (!evt) continue
        if (evt.type === 'state') this.lastState = evt
        this.emit(evt)
      }
    })
    child.stderr.setEncoding('utf8')
    child.stderr.on('data', (chunk: string) => {
      for (const l of chunk.split('\n')) if (l.trim()) console.error('[engine]', l)
    })
    child.stdin.on('error', () => {
      /* EPIPE when the engine died; handled by exit */
    })
    child.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'ENOENT') {
        onDown(`engine binary not found at ${path} — run \`cargo build -p engine-sidecar\``)
      } else {
        onDown(`engine failed to run: ${err.message}`)
      }
    })
    child.on('exit', (code, signal) => {
      onDown(`engine exited unexpectedly (${signal ? `signal ${signal}` : `exit code ${String(code)}`})`)
    })
  }

  send(cmd: Command): void {
    if (!this.child || !this.child.stdin.writable) {
      console.warn('[main] engine not running; dropping command', cmd.type)
      return
    }
    // The engine's fields are integers: round here (TS owns the units); an absolute seek can't go below 0.
    const c = cmd.type === 'seek' ? { ...cmd, positionMs: Math.max(0, Math.round(cmd.positionMs)) } : cmd.type === 'seekRelative' ? { ...cmd, deltaMs: Math.round(cmd.deltaMs) } : cmd
    this.child.stdin.write(JSON.stringify(c) + '\n')
  }

  /** Re-send the cached state (e.g. after a renderer reload). */
  resendState(): void {
    if (this.lastState) this.emit(this.lastState)
  }

  stop(): void {
    this.quitting = true
    if (this.restartTimer) clearTimeout(this.restartTimer)
    const child = this.child
    if (!child) return
    child.stdin.end()
    const t = setTimeout(() => {
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL')
    }, KILL_AFTER_MS)
    child.once('exit', () => clearTimeout(t))
  }

  private emit(evt: EngineEvent): void {
    const win = this.getWindow()
    if (win && !win.isDestroyed() && !win.webContents.isDestroyed()) win.webContents.send(IPC.event, evt)
  }
}
