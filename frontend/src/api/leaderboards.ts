import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { playerHeaders } from '@/lib/playerId'
import type { AvatarKey } from './auth'
import { apiFetch } from './client'

export interface LeaderboardEntry {
  /** 1 for the best score. Equal scores share a rank. */
  rank: number
  /** Who set the score, or `null` for a guest. */
  player: { username: string; avatar: AvatarKey } | null
  score: number
  durationMs: number
  achievedAt: string
  /** Whether this score is the caller's own (by account, or by this browser for guests). */
  you: boolean
}

export interface PlayerStanding {
  bestScore: number
  rank: number
}

/** One page of a game's leaderboard, as returned by `GET /api/leaderboards/{gameSlug}`. */
export interface LeaderboardResponse {
  gameSlug: string
  entries: LeaderboardEntry[]
  /** Zero-based. */
  page: number
  size: number
  totalEntries: number
  totalPages: number
  /** This player's standing, or absent when they have no score in the game yet. */
  player?: PlayerStanding | null
}

export const LEADERBOARD_PAGE_SIZE = 10

export const leaderboardKeys = {
  all: ['leaderboards'] as const,
  game: (gameSlug: string) => [...leaderboardKeys.all, gameSlug] as const,
  page: (gameSlug: string, page: number) => [...leaderboardKeys.game(gameSlug), page] as const,
}

export function fetchLeaderboard(gameSlug: string, page: number, signal?: AbortSignal): Promise<LeaderboardResponse> {
  const query = new URLSearchParams({ page: String(page), size: String(LEADERBOARD_PAGE_SIZE) })
  return apiFetch<LeaderboardResponse>(`/api/leaderboards/${encodeURIComponent(gameSlug)}?${query}`, {
    signal,
    headers: playerHeaders(),
  })
}

/** @param page zero-based page number */
export function useLeaderboard(gameSlug: string | undefined, page: number) {
  return useQuery({
    queryKey: leaderboardKeys.page(gameSlug ?? '', page),
    queryFn: ({ signal }) => fetchLeaderboard(gameSlug!, page, signal),
    enabled: gameSlug !== undefined,
    // Keep showing the current page while the next one loads, instead of flashing a spinner.
    placeholderData: keepPreviousData,
  })
}
