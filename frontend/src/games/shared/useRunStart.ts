import { useCallback, useRef, useState } from 'react'

/**
 * Tracks whether the current human run has begun, and reports its beginning exactly once.
 *
 * "Has it begun?" is kept in a ref as well as in state. State alone is not enough: two key presses
 * can arrive before React re-renders, and both handlers would still see "not started" and report
 * the run twice. The ref changes immediately, so the second press sees the truth.
 */
export function useRunStart(onGameStart: () => void) {
  const [started, setStarted] = useState(false)
  const startedNow = useRef(false)
  const startedAt = useRef(0)

  /** Begins the run if it has not begun yet. Returns `true` only for the call that began it. */
  const begin = useCallback((): boolean => {
    if (startedNow.current) return false
    startedNow.current = true
    startedAt.current = performance.now()
    setStarted(true)
    onGameStart()
    return true
  }, [onGameStart])

  /** Call when a new game is set up, so its first input begins a new run. */
  const reset = useCallback(() => {
    startedNow.current = false
    setStarted(false)
  }, [])

  /** Time since the run began. */
  const elapsedMs = useCallback(() => performance.now() - startedAt.current, [])

  return { started, begin, reset, elapsedMs }
}
