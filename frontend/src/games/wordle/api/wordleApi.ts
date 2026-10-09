import { apiFetch } from '@/api/client'
import { playerHeaders } from '@/lib/playerId'
import type { AiBenchmark, AiSolution, DailyView, HintType, RunView, StatsView, Strategy } from '../types/wordleTypes'

/**
 * Word Guess's own endpoints. Unlike the other games it is played on the server, which keeps the
 * hidden word; scores still go through the platform like every game's (the run's result is reported
 * with `onGameOver`). A guest is recognised by the same id their game sessions carry.
 */

export const WORD_NOT_IN_LIST = 'WORD_NOT_IN_LIST'
export const DAILY_ALREADY_PLAYED = 'DAILY_ALREADY_PLAYED'
export const HINT_UNAVAILABLE = 'HINT_UNAVAILABLE'

export function fetchDaily(signal?: AbortSignal): Promise<DailyView> {
  return apiFetch<DailyView>('/api/wordle/daily', { headers: playerHeaders(), signal })
}

/** Starts today's puzzle with the platform session just opened, or picks the player's run of it up again. */
export function startDaily(sessionId: string): Promise<RunView> {
  return apiFetch<RunView>('/api/wordle/daily/runs', { method: 'POST', body: { sessionId }, headers: playerHeaders() })
}

export function startPractice(): Promise<RunView> {
  return apiFetch<RunView>('/api/wordle/practice/runs', { method: 'POST', headers: playerHeaders() })
}

export function sendGuess(runId: string, word: string): Promise<RunView> {
  return apiFetch<RunView>(`/api/wordle/runs/${encodeURIComponent(runId)}/guesses`, {
    method: 'POST',
    body: { word },
    headers: playerHeaders(),
  })
}

export function takeHint(runId: string, type: HintType, letter?: string): Promise<RunView> {
  return apiFetch<RunView>(`/api/wordle/runs/${encodeURIComponent(runId)}/hints`, {
    method: 'POST',
    body: letter ? { type, letter } : { type },
    headers: playerHeaders(),
  })
}

export function fetchStats(signal?: AbortSignal): Promise<StatsView> {
  return apiFetch<StatsView>('/api/wordle/stats', { headers: playerHeaders(), signal })
}

/** Admins only: the server answers anyone else with 401 or 403. */
export function solveWithAi(strategy: Strategy, date?: string): Promise<AiSolution> {
  return apiFetch<AiSolution>('/api/ai/wordle/solve', { method: 'POST', body: date ? { strategy, date } : { strategy } })
}

/** Admins only: the strategy against every possible answer. */
export function benchmarkAi(strategy: Strategy): Promise<AiBenchmark> {
  return apiFetch<AiBenchmark>(`/api/ai/wordle/benchmark?strategy=${strategy}`)
}
