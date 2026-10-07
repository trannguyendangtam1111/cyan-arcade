import { useEffect, useRef } from 'react'

/** The longest frame a game simulates in one go: a stalled tab must not make it jump ahead. */
export const MAX_FRAME_MS = 100

/**
 * A game loop for real-time games drawn on a canvas. Calls `onFrame(elapsedMs, nowMs)` on every
 * animation frame while `running`, with the real time since the previous frame (at most
 * {@link MAX_FRAME_MS}). The loop stops when `running` turns
 * false and on unmount, so leaving the page leaves nothing behind.
 */
export function useFrameLoop(onFrame: (elapsedMs: number, nowMs: number) => void, running: boolean): void {
  const latest = useRef(onFrame)
  useEffect(() => {
    latest.current = onFrame
  })

  useEffect(() => {
    if (!running || typeof window.requestAnimationFrame !== 'function') return
    let handle = 0
    let previous: number | null = null
    const frame = (now: number) => {
      const elapsed = previous === null ? 0 : Math.min(Math.max(now - previous, 0), MAX_FRAME_MS)
      previous = now
      latest.current(elapsed, now)
      handle = window.requestAnimationFrame(frame)
    }
    handle = window.requestAnimationFrame(frame)
    return () => window.cancelAnimationFrame(handle)
  }, [running])
}
