// Waits for the engine's albumInfo answer to a preview scan, so the rack can show a tracklist without recording the album.
import type { Album } from '@shared/protocol'

export function scanWaiter(send: (path: string) => void, timeoutMs: number) {
  const pending = new Map<string, { resolvers: ((a: Album | null) => void)[]; timer: ReturnType<typeof setTimeout> }>()
  // Scans sent per path and not yet answered: a late answer (after the timeout) is still a preview's, never recorded.
  const owed = new Map<string, number>()
  const settle = (path: string, album: Album | null): void => {
    const p = pending.get(path)
    if (!p) return
    pending.delete(path)
    clearTimeout(p.timer)
    for (const r of p.resolvers) r(album)
  }
  return {
    request(path: string): Promise<Album | null> {
      return new Promise((resolve) => {
        const p = pending.get(path)
        if (p) return p.resolvers.push(resolve)
        pending.set(path, { resolvers: [resolve], timer: setTimeout(() => settle(path, null), timeoutMs) })
        owed.set(path, (owed.get(path) ?? 0) + 1)
        send(path)
      })
    },
    // The engine answers one path's scans in order, so the oldest owed scan is the one being answered.
    answer(path: string, album: Album | null): boolean {
      const n = owed.get(path) ?? 0
      if (n === 0) return false
      if (n === 1) owed.delete(path)
      else owed.set(path, n - 1)
      settle(path, album)
      return true
    },
    // The engine crashed: scans in flight will never be answered.
    reset(): void {
      owed.clear()
      for (const path of [...pending.keys()]) settle(path, null)
    }
  }
}
