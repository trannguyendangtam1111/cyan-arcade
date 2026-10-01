import { useEffect, useRef } from 'react'

/**
 * Calls `callback` every `intervalMs` while mounted. Pass `null` to stop.
 *
 * Drives both real-time game loops (gravity, snake movement) and AI playback. The next call is
 * scheduled only after the current one returns, so a slow callback can never pile up behind itself
 * and the browser always gets a chance to paint in between. The timer is cleared on unmount and
 * whenever the interval changes, so pausing, restarting or leaving the page leaves nothing behind.
 */
export function useTicker(callback: () => void, intervalMs: number | null): void {
  const latest = useRef(callback)
  useEffect(() => {
    latest.current = callback
  })

  useEffect(() => {
    if (intervalMs === null) return

    let timer: ReturnType<typeof setTimeout>
    const run = () => {
      latest.current()
      timer = setTimeout(run, intervalMs)
    }
    timer = setTimeout(run, intervalMs)
    return () => clearTimeout(timer)
  }, [intervalMs])
}
