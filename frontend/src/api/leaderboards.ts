import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { playerHeaders } from '@/lib/playerId'
import type { AvatarKey } from './auth'
import { apiFetch } from './client'

/**
 * Which scores a board counts: today's, this week's or every one. The server decides where each
 * starts and ends (UTC; weeks from Monday), never this device's clock.
 */
export type LeaderboardPeriod = 'DAILY' | 'WEEKLY' | 'ALL_TIME'

export const LEADERBOARD_PERIODS: LeaderboardPeriod[] = ['DAILY', 'WEEKLY', 'ALL_TIME']

/** How a period is written in the leaderboard's URL (people read it) and on screen. */
export const periodNames: Record<LeaderboardPeriod, { param: string; label: string; board: string }> = {
  DAILY: { param: 'daily', label: 'Today', board: 'today' },
  WEEKLY: { param: 'weekly', label: 'This week', board: 'this week' },
  ALL_TIME: { param: 'all-time', label: 'All time', board: 'of all time' },
}

/** The leaderboard page for a game and period. */
export function leaderboardUrl(gameSlug: string, period: LeaderboardPeriod = 'ALL_TIME'): string {
  return `/leaderboard?game=${encodeURIComponent(gameSlug)}&period=${periodNames[period].param}`
}

export interface LeaderboardEntry {
  /** 1 for the best. No two entries share one: equal scores are ranked by who set theirs first. */
  rank: number
  /** Who set the score (`username` for links, `displayName` to show), or `null` for a guest. */
  player: { username: string; displayName: string; avatar: AvatarKey } | null
  /** The player's best score in the period. */
  score: number
  durationMs: number
  achievedAt: string
  /** Whether this entry is the caller's own (by account, or by this browser for guests). */
  you: boolean
}

/** One page of a board, as returned by `GET /api/leaderboards/{gameSlug}?period=…`: each player once. */
export interface LeaderboardResponse {
  gameSlug: string
  period: LeaderboardPeriod
  /** When the period started and when the next one starts; `null` for all time. */
  periodStart: string | null
  periodEnd: string | null
  entries: LeaderboardEntry[]
  /** Zero-based. */
  page: number
  size: number
  /** Players on the board. */
  totalEntries: number
  totalPages: number
  /** The caller's place and best score on this board; `null` when they have no score in the period. */
  myRank: number | null
  myScore: number | null
}

/** A rank on one board. */
export interface Standing {
  rank: number
  score: number
}

/** `GET /api/users/me/ranks`: where the signed-in player stands on every board. */
export interface PlayerRanks {
  /** The best all-time rank in any game, and which game; `null` until the player has a score. */
  bestRank: number | null
  bestRankGame: { slug: string; name: string } | null
  games: {
    game: { slug: string; name: string }
    daily: Standing | null
    weekly: Standing | null
    allTime: Standing | null
  }[]
}

export const LEADERBOARD_PAGE_SIZE = 20

export const leaderboardKeys = {
  all: ['leaderboards'] as const,
  game: (gameSlug: string) => [...leaderboardKeys.all, gameSlug] as const,
  page: (gameSlug: string, period: LeaderboardPeriod, page: number) =>
    [...leaderboardKeys.game(gameSlug), period, page] as const,
}

export function fetchLeaderboard(
  gameSlug: string,
  period: LeaderboardPeriod,
  page: number,
  signal?: AbortSignal,
): Promise<LeaderboardResponse> {
  const query = new URLSearchParams({ period, page: String(page), size: String(LEADERBOARD_PAGE_SIZE) })
  return apiFetch<LeaderboardResponse>(`/api/leaderboards/${encodeURIComponent(gameSlug)}?${query}`, {
    signal,
    headers: playerHeaders(),
  })
}

/** @param page zero-based page number */
export function useLeaderboard(gameSlug: string | undefined, period: LeaderboardPeriod, page: number) {
  return useQuery({
    queryKey: leaderboardKeys.page(gameSlug ?? '', period, page),
    queryFn: ({ signal }) => fetchLeaderboard(gameSlug!, period, page, signal),
    enabled: gameSlug !== undefined,
    // Keep showing the current page while the next one loads, instead of flashing a spinner.
    placeholderData: keepPreviousData,
  })
}
