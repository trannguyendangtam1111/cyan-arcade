import { apiFetch } from '@/api/client'
import { playerHeaders } from '@/lib/playerId'
import type { AiSolution, Difficulty, HintResponse, HintType, RunView, StatsView, Strategy, TodayView } from '../types/sudokuTypes'

/**
 * Sudoku's own endpoints. Like Word Guess it is played on the server, which keeps the solution and
 * the clock; scores still go through the platform like every game's (the run's result is reported
 * with `onGameOver`). A guest is recognised by the same id their game sessions carry.
 */

export const DAILY_ALREADY_PLAYED = 'DAILY_ALREADY_PLAYED'
export const HINT_UNAVAILABLE = 'HINT_UNAVAILABLE'
export const RUN_OVER = 'RUN_OVER'
export const CELL_LOCKED = 'CELL_LOCKED'

const runPath = (runId: string, action: string) => `/api/sudoku/runs/${encodeURIComponent(runId)}/${action}`

export function fetchToday(signal?: AbortSignal): Promise<TodayView> {
  return apiFetch<TodayView>('/api/sudoku/today', { headers: playerHeaders(), signal })
}

/** Starts today's puzzle with the platform session just opened, or picks the player's run of it up again. */
export function startDaily(sessionId: string): Promise<RunView> {
  return apiFetch<RunView>('/api/sudoku/daily/runs', { method: 'POST', body: { sessionId }, headers: playerHeaders() })
}

/** A practice game: ranked with a session, relaxed without one. */
export function startPractice(difficulty: Difficulty, sessionId: string | null): Promise<RunView> {
  return apiFetch<RunView>('/api/sudoku/practice/runs', {
    method: 'POST',
    body: sessionId ? { difficulty, sessionId } : { difficulty },
    headers: playerHeaders(),
  })
}

/** Ties a ranked run to a new session, after a reload. */
export function bindSession(runId: string, sessionId: string): Promise<RunView> {
  return apiFetch<RunView>(runPath(runId, 'session'), { method: 'POST', body: { sessionId }, headers: playerHeaders() })
}

/** Digits entered (0 clears a cell), in order. */
export function sendMoves(runId: string, moves: { cell: number; digit: number }[]): Promise<RunView> {
  return apiFetch<RunView>(runPath(runId, 'moves'), { method: 'POST', body: { moves }, headers: playerHeaders() })
}

export function takeHint(runId: string, type: HintType, cell?: number): Promise<HintResponse> {
  return apiFetch<HintResponse>(runPath(runId, 'hints'), {
    method: 'POST',
    body: cell === undefined ? { type } : { type, cell },
    headers: playerHeaders(),
  })
}

/** Stops the run's clock. `keepalive` lets it go out while the page is being left. */
export function pauseRun(runId: string, keepalive = false): Promise<RunView> {
  return apiFetch<RunView>(runPath(runId, 'pause'), { method: 'POST', headers: playerHeaders(), keepalive })
}

export function resumeRun(runId: string): Promise<RunView> {
  return apiFetch<RunView>(runPath(runId, 'resume'), { method: 'POST', headers: playerHeaders() })
}

export function fetchStats(signal?: AbortSignal): Promise<StatsView> {
  return apiFetch<StatsView>('/api/sudoku/stats', { headers: playerHeaders(), signal })
}

/**
 * Admins only: the server answers anyone else with 401 or 403. A day's daily puzzle, or a practice
 * puzzle of a difficulty (a seed picks it).
 */
export function solveWithAi(strategy: Strategy, puzzle: { date?: string; difficulty?: Difficulty; seed?: number }): Promise<AiSolution> {
  return apiFetch<AiSolution>('/api/ai/sudoku/solve', { method: 'POST', body: { strategy, ...puzzle } })
}
