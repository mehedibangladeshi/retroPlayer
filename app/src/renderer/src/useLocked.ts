import { useEffect, useState } from 'react'

// The universal "Lock windows" state, owned by main. False until main answers.
export function useLocked(): boolean {
  const [locked, setLocked] = useState(false)
  useEffect(() => {
    let live = true
    let pushed = false // a push is newer than the initial read, so it wins over a late reply
    void window.retro.getLocked().then((l) => live && !pushed && setLocked(l)).catch(() => {})
    const off = window.retro.onLocked((l) => {
      pushed = true
      setLocked(l)
    })
    return () => {
      live = false
      off()
    }
  }, [])
  return locked
}
