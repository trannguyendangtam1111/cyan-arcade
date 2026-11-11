import { apiFetch } from '@/api/client'
import { playerHeaders } from '@/lib/playerId'
import type { AiSolution, ArchivePuzzleView, DailyHistoryView, Difficulty, HintResponse, HintType, NoteCellView, NotesView, RunView, StatsView, Strategy, TodayView } from '../types/sudokuTypes'

/**
 * Sudoku's own endpoints. Like Word Guess it is played on the server, which keeps the solution and
 * the clock; scores still go through the platform like every game's (the run's result is reported
 * with `onGameOver`). A guest is recognised by the same id their game sessions carry.
 */

export const DAILY_ALREADY_PLAYED = 'DAILY_ALREADY_PLAYED'
export const HINT_UNAVAILABLE = 'HINT_UNAVAILABLE'
export const RUN_OVER = 'RUN_OVER'
export const CELL_LOCKED = 'CELL_LOCKED'
export const NOTES_STALE = 'NOTES_STALE'

const runPath = (runId: string, action: string) => `/api/sudoku/runs/${encodeURIComponent(runId)}/${action}`

export function fetchToday(signal?: AbortSignal): Promise<TodayView> {
  return apiFetch<TodayView>('/api/sudoku/today', { headers: playerHeaders(), signal })
}

/** Starts today's puzzle with the platform session just opened, or picks the player's run of it up again. */
export function startDaily(sessionId: string): Promise<RunView> {
  return apiFetch<RunView>('/api/sudoku/daily/runs', { method: 'POST', body: { sessionId }, headers: playerHeaders() })
}

/** A past Daily puzzle's number, difficulty and clues, by UTC date (`YYYY-MM-DD`). 404 `NOT_IN_ARCHIVE` outside the archive. */
export function fetchArchivePuzzle(date: string, signal?: AbortSignal): Promise<ArchivePuzzleView> {
  return apiFetch<ArchivePuzzleView>(`/api/sudoku/archive/${encodeURIComponent(date)}`, { signal })
}

/**
 * Replays a past Daily puzzle, unranked: no platform session, so no score, rewards or streak, and
 * nothing to do with that day's official run. Leaves any replay in progress.
 */
export function startArchive(date: string): Promise<RunView> {
  return apiFetch<RunView>('/api/sudoku/archive/runs', { method: 'POST', body: { date }, headers: playerHeaders() })
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

/** A signed-in player's saved pencil marks for one of their runs; 401 for guests, 404 for someone else's run. */
export function fetchNotes(runId: string): Promise<NotesView> {
  return apiFetch<NotesView>(runPath(runId, 'notes'))
}

/**
 * Saves a run's pencil marks over the revision this page last saw: 409 `NOTES_STALE` when another
 * device has saved since, `RUN_OVER` once the run is over. `keepalive` lets it go out while the page is being left.
 * `baseCells`, when given, are the marks expected at `baseRevision`: any others there make the save stale too.
 */
export function saveRunNotes(runId: string, baseRevision: number, cells: NoteCellView[], keepalive = false, baseCells?: NoteCellView[]): Promise<NotesView> {
  const body = baseCells ? { baseRevision, cells, baseCells } : { baseRevision, cells }
  return apiFetch<NotesView>(runPath(runId, 'notes'), { method: 'PUT', body, keepalive })
}

export function fetchStats(signal?: AbortSignal): Promise<StatsView> {
  return apiFetch<StatsView>('/api/sudoku/stats', { headers: playerHeaders(), signal })
}

/** The signed-in player's last 30 UTC dates of Daily Sudoku; 401 for guests. */
export function fetchDailyHistory(signal?: AbortSignal): Promise<DailyHistoryView> {
  return apiFetch<DailyHistoryView>('/api/sudoku/daily/history', { signal })
}

/**
 * Admins only: the server answers anyone else with 401 or 403. A day's daily puzzle, or a practice
 * puzzle of a difficulty (a seed picks it).
 */
export function solveWithAi(strategy: Strategy, puzzle: { date?: string; difficulty?: Difficulty; seed?: number }): Promise<AiSolution> {
  return apiFetch<AiSolution>('/api/ai/sudoku/solve', { method: 'POST', body: { strategy, ...puzzle } })
}
