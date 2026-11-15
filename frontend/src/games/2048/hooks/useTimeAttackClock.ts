import { useCallback, useEffect, useRef, useState } from 'react'
import { useFrameLoop } from '@/games/shared/useFrameLoop'
import { clockStepsDue } from './timeAttackClock'

export interface TimeAttackClockOptions {
  /**
   * Whether a human's timed run is on the clock: a timed run, started by its first valid move and not
   * over. The AI's game time does not come from frames (see `applyAiMove`), so an AI run is never
   * active here.
   */
  active: boolean
  /** Whether the player has paused. A paused run gets no game time. */
  paused: boolean
  /** Plays this many whole clock steps (`advanceClock`). Called only with at least one step. */
  onSteps: (steps: number) => void
  /** Called when the tab is hidden during an active, unpaused run, so the run pauses itself. */
  onHidden: () => void
}

export interface TimeAttackClock {
  /**
   * Whether the board should be hidden: while paused or while the tab is hidden. A paused human run
   * hides its board, so a pause is no free thinking time.
   */
  boardHidden: boolean
  /** Throws away real time carried over from earlier frames. Call it when a new run starts. */
  reset: () => void
}

/**
 * Drives a human Time Attack run's game clock from animation frames. Game time advances in whole
 * fixed steps (`clockStepsDue`), so it does not depend on the frame rate; one long frame is capped by
 * `useFrameLoop` and cannot carry the clock far past real time. No time passes while the run is
 * paused or the tab is hidden: the frame loop stops, and its next start does not count the gap.
 * Hiding the tab also pauses the run (`onHidden`), so coming back to it shows a paused, hidden board
 * until the player resumes.
 */
export function useTimeAttackClock({ active, paused, onSteps, onHidden }: TimeAttackClockOptions): TimeAttackClock {
  const pendingMs = useRef(0)
  const [tabHidden, setTabHidden] = useState(() => typeof document !== 'undefined' && document.hidden)
  const latest = useRef({ active, paused, onHidden })
  useEffect(() => {
    latest.current = { active, paused, onHidden }
  })

  useEffect(() => {
    const onVisibility = () => {
      setTabHidden(document.hidden)
      const current = latest.current
      if (document.hidden && current.active && !current.paused) current.onHidden()
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [])

  useFrameLoop(
    (frameMs) => {
      // A frame can still arrive between the tab hiding and the loop stopping; it gets no time.
      if (document.hidden) return
      const due = clockStepsDue(pendingMs.current, frameMs)
      pendingMs.current = due.pendingMs
      if (due.steps > 0) onSteps(due.steps)
    },
    active && !paused && !tabHidden,
  )

  const reset = useCallback(() => {
    pendingMs.current = 0
  }, [])

  return { boardHidden: paused || tabHidden, reset }
}
