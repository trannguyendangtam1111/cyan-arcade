import { useQuery } from '@tanstack/react-query'
import { ApiError, apiFetch } from './client'

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
  modes: (slug: string) => [...gameKeys.all, 'modes', slug] as const,
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

// --- Modes -----------------------------------------------------------------------------------------

/** Which end of a mode's board is best: the highest score first, or the lowest (a fastest time). */
export type ModeOrder = 'DESC' | 'ASC'
/** What a mode's score counts: points, or a time in milliseconds. */
export type ModeUnit = 'POINTS' | 'MILLISECONDS'

/** A way to play a game, as returned by `GET /api/games/{slug}/modes`. */
export interface GameMode {
  /** Stable ID, sent when a run starts and when asking for a leaderboard. */
  id: string
  name: string
  /** Whether the mode has a leaderboard. */
  ranked: boolean
  order: ModeOrder
  unit: ModeUnit
}

/** The mode every scored game has. A backend from before game modes offers this one alone. */
export const CLASSIC: GameMode = { id: 'classic', name: 'Classic', ranked: true, order: 'DESC', unit: 'POINTS' }

/**
 * The modes a game offers, as the server declares them: the only source of truth for which modes
 * exist. A backend from before game modes has no such endpoint (404, or 405 in front of some
 * proxies): every game there is played in Classic alone. Any other failure (unreachable, a server
 * error) is not an answer and is thrown, so it is not mistaken for "Classic only" and is asked again.
 */
export async function fetchGameModes(slug: string, signal?: AbortSignal): Promise<GameMode[]> {
  try {
    const modes = await apiFetch<GameMode[]>(`/api/games/${encodeURIComponent(slug)}/modes`, { signal })
    return Array.isArray(modes) ? modes : [CLASSIC]
  } catch (error) {
    if (error instanceof ApiError && (error.status === 404 || error.status === 405)) return [CLASSIC]
    throw error
  }
}

/** The modes of a game. They only change when the backend is deployed, so asked once a page load. */
export function useGameModes(slug: string, { enabled = true }: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: gameKeys.modes(slug),
    queryFn: ({ signal }) => fetchGameModes(slug, signal),
    staleTime: Infinity,
    enabled,
  })
}

/** The modes that have a leaderboard, in the server's order. An unranked mode has none. */
export function rankedModes(modes: GameMode[]): GameMode[] {
  return modes.filter((mode) => mode.ranked)
}
