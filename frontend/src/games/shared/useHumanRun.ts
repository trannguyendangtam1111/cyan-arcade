import { useCallback, useRef, useState } from 'react'
import type { GameProps } from '@/games/types'
import { useHighScore } from './useHighScore'
import { useRunStart } from './useRunStart'

/**
 * The life cycle of one human run, identical for every game:
 *
 *   begin()            first input     → tells the platform the run started (once)
 *   finish(score, ..)  game over       → updates the best score and reports the result (once)
 *   reset()            a new game      → ready for the next run
 *
 * Games call these three and nothing else, so none of them contains its own score-reporting code.
 * AI runs simply never call `begin` or `finish`.
 */
export function useHumanRun(gameSlug: string, { onGameStart, onGameOver }: GameProps) {
  const { started, begin, reset: resetStart, elapsedMs } = useRunStart(onGameStart)
  const { best, record } = useHighScore(gameSlug)
  const [newBest, setNewBest] = useState(false)
  // A ref, for the same reason as in useRunStart: several ticks can fire before a re-render.
  const finished = useRef(false)

  const finish = useCallback(
    (score: number, metadata?: Record<string, unknown>) => {
      if (finished.current) return
      finished.current = true
      setNewBest(record(score))
      onGameOver({ score, durationMs: elapsedMs(), metadata })
    },
    [record, onGameOver, elapsedMs],
  )

  const reset = useCallback(() => {
    resetStart()
    finished.current = false
    setNewBest(false)
  }, [resetStart])

  return {
    /** Whether the player has made their first input in this run. */
    started,
    begin,
    finish,
    reset,
    /** Time since the run began, by this device's clock. */
    elapsedMs,
    /** Best score on this device, including the run that just finished. */
    best,
    /** Whether the run that just finished set a new best. */
    newBest,
  }
}
