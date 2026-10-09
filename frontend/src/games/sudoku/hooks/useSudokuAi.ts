import { useCallback, useEffect, useMemo, useState } from 'react'
import { ApiError } from '@/api/client'
import type { AiSpeed } from '@/games/shared/ai'
import type { SudokuAiPlayer } from '../ai/sudokuAiPlayer'
import { solveWithAi } from '../api/sudokuApi'
import type { AiSolution, Difficulty, Strategy } from '../types/sudokuTypes'

export type AiState = 'idle' | 'loading' | 'playing' | 'finished'

/** Which puzzle the AI solves: today's daily, or a new practice puzzle of a difficulty. */
export type AiPuzzle = 'DAILY' | Difficulty

/**
 * AI mode for admins: asks the server to solve a puzzle with a strategy (the server checks the caller
 * is an admin), then plays the moves back on the board at the chosen speed, or one at a time. Speed,
 * pause and stepping only change when the next move shows; the moves are the server's.
 */
export function useSudokuAi(player: SudokuAiPlayer | undefined, speed: AiSpeed, paused: boolean) {
  const [strategy, setStrategy] = useState<Strategy>('STEP_BY_STEP')
  const [puzzle, setPuzzle] = useState<AiPuzzle>('DAILY')
  const [state, setState] = useState<AiState>('idle')
  const [solution, setSolution] = useState<AiSolution | null>(null)
  const [played, setPlayed] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const solve = useCallback(async () => {
    if (!player) return
    setState('loading')
    setError(null)
    try {
      const answer = await solveWithAi(strategy, puzzle === 'DAILY' ? {} : { difficulty: puzzle })
      setSolution(answer)
      setPlayed(0)
      setState('playing')
    } catch (failure) {
      setState('idle')
      setError(failure instanceof ApiError && failure.status === 403 ? 'AI mode is for admins.' : "The AI couldn't solve that puzzle.")
    }
  }, [player, strategy, puzzle])

  /** The same puzzle again with another strategy: what makes the three comparable. */
  const replayWith = useCallback(
    async (next: Strategy) => {
      setStrategy(next)
      if (!player || !solution) return
      setState('loading')
      try {
        const answer = await solveWithAi(next, solution.date ? { date: solution.date } : { difficulty: solution.difficulty, seed: solution.seed })
        setSolution(answer)
        setPlayed(0)
        setState('playing')
      } catch {
        setState('finished')
        setError("The AI couldn't solve that puzzle.")
      }
    },
    [player, solution],
  )

  const done = solution !== null && played >= solution.moves.length

  // Plays the moves back, one per wait.
  useEffect(() => {
    if (!player || state !== 'playing' || paused || !solution || played >= solution.moves.length) return
    const timer = window.setTimeout(() => setPlayed(played + 1), player.delay(solution, solution.moves[played], speed))
    return () => window.clearTimeout(timer)
  }, [player, state, paused, solution, played, speed])

  /** One move forward, whatever the playback is doing. */
  const step = useCallback(() => {
    if (!solution) return
    setPlayed((count) => Math.min(solution.moves.length, count + 1))
  }, [solution])

  const restart = useCallback(() => {
    if (!solution) return
    setPlayed(0)
    setState('playing')
  }, [solution])

  const frame = useMemo(() => (player && solution ? player.frame(solution, played) : null), [player, solution, played])

  // Every move shown: the solve is over, however it got there.
  return { strategy, setStrategy: replayWith, puzzle, setPuzzle, state: state === 'playing' && done ? ('finished' as const) : state, solution, played, frame, error, solve: () => void solve(), step, restart }
}
