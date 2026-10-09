import { useCallback, useEffect, useMemo, useState } from 'react'
import { ApiError } from '@/api/client'
import type { AiSpeed } from '@/games/shared/ai'
import type { AiAction, WordleAiPlayer } from '../ai/wordleAiPlayer'
import { benchmarkAi, solveWithAi } from '../api/wordleApi'
import type { AiRecord } from '../components/strategies'
import type { AiBenchmark, AiSolution, Strategy } from '../types/wordleTypes'

export type AiState = 'idle' | 'loading' | 'playing' | 'finished'

/**
 * AI mode for admins: asks the server to solve a daily puzzle with a strategy (the server checks the
 * caller is an admin), then plays the answer back on the board at the chosen speed. Speed and pause
 * only change the waits; the guesses are the server's, the same at every speed.
 */
export function useWordleAi(player: WordleAiPlayer | undefined, speed: AiSpeed, paused: boolean, today: string | null) {
  const [strategy, setStrategy] = useState<Strategy>('BALANCED')
  const [date, setDate] = useState<string | null>(null)
  const [state, setState] = useState<AiState>('idle')
  const [solution, setSolution] = useState<AiSolution | null>(null)
  const [script, setScript] = useState<AiAction[]>([])
  const [played, setPlayed] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [history, setHistory] = useState<AiRecord[]>([])
  const [benchmark, setBenchmark] = useState<{ strategy: Strategy; result: AiBenchmark | null; loading: boolean } | null>(null)

  const day = date ?? today ?? ''

  const solve = useCallback(async () => {
    if (!player) return
    setState('loading')
    setError(null)
    try {
      const answer = await solveWithAi(strategy, day || undefined)
      setSolution(answer)
      setScript(player.script(answer))
      setPlayed(0)
      setState('playing')
    } catch (failure) {
      setState('idle')
      setError(failure instanceof ApiError && failure.status === 403 ? 'AI mode is for admins.' : "The AI couldn't solve that puzzle.")
    }
  }, [player, strategy, day])

  // Plays the script back, one action per wait.
  useEffect(() => {
    if (!player || state !== 'playing' || paused || !solution) return
    // After the last action the solve is over once its row has turned over, as for a player.
    const ending = played >= script.length
    const wait = ending ? player.delay({ kind: 'think', step: 1 }, speed) * 0.8 : player.delay(script[played], speed)
    const timer = window.setTimeout(() => {
      if (!ending) {
        setPlayed(played + 1)
        return
      }
      setState('finished')
      setHistory((records) => [
        ...records,
        { strategy: solution.strategy, puzzleNumber: solution.puzzleNumber, solved: solution.solved, guesses: solution.guesses },
      ])
    }, wait)
    return () => window.clearTimeout(timer)
  }, [player, state, paused, solution, script, played, speed])

  const frame = useMemo(
    () => (player && solution ? player.frame(solution, script, played) : null),
    [player, solution, script, played],
  )

  /** The action just played, for the keyboard and the AI panel. */
  const last = played > 0 ? script[played - 1] : undefined

  const runBenchmark = useCallback(() => {
    const chosen = strategy
    setBenchmark({ strategy: chosen, result: null, loading: true })
    benchmarkAi(chosen)
      .then((result) => setBenchmark((current) => (current?.strategy === chosen ? { strategy: chosen, result, loading: false } : current)))
      .catch(() => setBenchmark((current) => (current?.strategy === chosen ? { strategy: chosen, result: null, loading: false } : current)))
  }, [strategy])

  return {
    strategy,
    setStrategy,
    date: day,
    setDate,
    state,
    solution,
    frame,
    played,
    last,
    error,
    history,
    benchmark,
    solve: () => void solve(),
    runBenchmark,
    reset: () => {
      setSolution(null)
      setScript([])
      setPlayed(0)
      setState('idle')
    },
  }
}
