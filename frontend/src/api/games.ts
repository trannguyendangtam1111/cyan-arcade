import { useQuery } from '@tanstack/react-query'
import { apiFetch } from './client'

export type GameCategory = 'ARCADE' | 'PUZZLE' | 'STRATEGY' | 'CARD'

/** A catalog entry as returned by `GET /api/games`. */
export interface GameResponse {
  id: number
  slug: string
  name: string
  description: string
  category: GameCategory
  thumbnailUrl: string
  accentColor: string
  /** Whether the hub puts this game in the spotlight. */
  featured: boolean
  /**
   * Whether the platform keeps its scores. An unscored game (one two people play on one device, say)
   * has no score sessions, leaderboard, rewards or daily challenge.
   */
  scored: boolean
}

export const gameKeys = {
  all: ['games'] as const,
  list: () => [...gameKeys.all, 'list'] as const,
  detail: (slug: string) => [...gameKeys.all, 'detail', slug] as const,
}

export function fetchGames(signal?: AbortSignal): Promise<GameResponse[]> {
  return apiFetch<GameResponse[]>('/api/games', { signal })
}

export function fetchGame(slug: string, signal?: AbortSignal): Promise<GameResponse> {
  return apiFetch<GameResponse>(`/api/games/${encodeURIComponent(slug)}`, { signal })
}

// The catalog only changes when a new game is deployed, so it can stay fresh for a long time.
const CATALOG_STALE_TIME = 5 * 60_000

export function useGames() {
  return useQuery({
    queryKey: gameKeys.list(),
    queryFn: ({ signal }) => fetchGames(signal),
    staleTime: CATALOG_STALE_TIME,
  })
}

export function useGame(slug: string) {
  return useQuery({
    queryKey: gameKeys.detail(slug),
    queryFn: ({ signal }) => fetchGame(slug, signal),
    staleTime: CATALOG_STALE_TIME,
  })
}
