import { playerHeaders } from '@/lib/playerId'
import { apiFetch } from './client'

/** The mode every game has, and the one a run is played under unless another is chosen. */
export const CLASSIC_MODE = 'classic'

/**
 * The mode a run was played under, as the server reports it. A backend from before game modes does
 * not report one: every run there is Classic.
 */
export function modeOf(response: { mode?: string | null }): string {
  return response.mode || CLASSIC_MODE
}

/** A started run, as returned by `POST /api/game-sessions`. */
export interface GameSessionResponse {
  id: string
  gameSlug: string
  /** The mode the server opened the run under; absent from an older backend (Classic). */
  mode?: string
  startedAt: string
}

/** The result the server recorded for a finished run. */
export interface ScoreResponse {
  sessionId: string
  gameSlug: string
  /** The mode of the run, the one its session started with; absent from an older backend (Classic). */
  mode?: string
  score: number
  /** Time between starting and finishing the session, measured by the server. */
  durationMs: number
  recordedAt: string
  /** What this run earned its player; `null` for guests. */
  rewards: Rewards | null
}

export interface Rewards {
  /** Everything this run added: the run itself, a personal-best bonus, achievements and bonuses. */
  xpEarned: number
  /** The same, in coins. */
  coinsEarned: number
  personalBest: boolean
  achievements: { code: string; name: string; description: string; xp: number; coins: number }[]
  /** Extra rewards from other features, such as a completed daily challenge. */
  bonuses: RewardBonus[]
  totalXp: number
  level: number
  leveledUp: boolean
  /** The player's coins afterwards. */
  coinBalance: number
}

export interface RewardBonus {
  /** What kind of bonus this is. */
  type: 'DAILY_CHALLENGE' | (string & {})
  title: string
  xp: number
  coins: number
}

/** Returned when a session is finished a second time. */
export const SESSION_ALREADY_FINISHED = 'SESSION_ALREADY_FINISHED'
/** Returned when the server does not accept the run as played. It never says why. */
export const SCORE_REJECTED = 'SCORE_REJECTED'
/** Returned when a session was left open too long to be finished. */
export const SESSION_EXPIRED = 'SESSION_EXPIRED'

/** @param mode one of the game's modes (`GET /api/games/{slug}/modes`); Classic when not given. */
export function startGameSession(gameSlug: string, mode: string = CLASSIC_MODE): Promise<GameSessionResponse> {
  return apiFetch<GameSessionResponse>('/api/game-sessions', {
    method: 'POST',
    body: { gameSlug, mode },
    // Marks the run as this guest's, so the leaderboard can point out their scores.
    headers: playerHeaders(),
  })
}

/**
 * @param details game-specific numbers about the run (lines, highest tile, ...). The server checks
 * them against the score and uses them for achievements and challenges.
 */
export function finishGameSession(
  sessionId: string,
  score: number,
  details: Record<string, number> = {},
): Promise<ScoreResponse> {
  return apiFetch<ScoreResponse>(`/api/game-sessions/${encodeURIComponent(sessionId)}/finish`, {
    method: 'POST',
    body: { score, details },
    // A guest's run can only be finished by the browser that started it.
    headers: playerHeaders(),
  })
}
