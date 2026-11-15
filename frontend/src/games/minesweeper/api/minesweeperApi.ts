import { apiFetch } from '@/api/client'
import type { DailyAttempt, DailyLeaderboard, DailyToday } from '../types/dailyTypes'

/**
 * The Daily Board's own endpoints. Unlike Minesweeper's other modes it is played on the server, which
 * keeps the day's mines: every reveal and flag is sent, and the board shown is the one the server
 * answers with. Every endpoint needs a signed-in account (401 otherwise).
 */

/** A move on an attempt that is over (won, lost or out of time). */
export const ATTEMPT_OVER = 'ATTEMPT_OVER'

const ATTEMPTS = '/api/minesweeper/daily/attempts'

export function fetchToday(signal?: AbortSignal): Promise<DailyToday> {
  return apiFetch<DailyToday>('/api/minesweeper/daily', { signal })
}

/** Starts today's attempt, or gives back the one the account already has: never a second one. */
export function startAttempt(): Promise<DailyAttempt> {
  return apiFetch<DailyAttempt>(ATTEMPTS, { method: 'POST' })
}

export function fetchAttempt(id: string, signal?: AbortSignal): Promise<DailyAttempt> {
  return apiFetch<DailyAttempt>(`${ATTEMPTS}/${encodeURIComponent(id)}`, { signal })
}

/** Uncovers a cell. Asking again for a cell already uncovered changes nothing, so a retry is safe. */
export function revealCell(id: string, cell: number): Promise<DailyAttempt> {
  return apiFetch<DailyAttempt>(`${ATTEMPTS}/${encodeURIComponent(id)}/reveal`, { method: 'POST', body: { cell } })
}

/** Sets a flag on or off: the same request twice leaves the board as once, so a retry is safe. */
export function setFlag(id: string, cell: number, flagged: boolean): Promise<DailyAttempt> {
  return apiFetch<DailyAttempt>(`${ATTEMPTS}/${encodeURIComponent(id)}/flag`, { method: 'POST', body: { cell, flagged } })
}

export function fetchLeaderboard(date: string, signal?: AbortSignal): Promise<DailyLeaderboard> {
  const query = new URLSearchParams({ date, page: '0', size: '10' })
  return apiFetch<DailyLeaderboard>(`/api/minesweeper/daily/leaderboard?${query}`, { signal })
}
