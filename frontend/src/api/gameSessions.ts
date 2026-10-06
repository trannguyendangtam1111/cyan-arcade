import { playerHeaders } from '@/lib/playerId'
import { apiFetch } from './client'

/** A started run, as returned by `POST /api/game-sessions`. */
export interface GameSessionResponse {
  id: string
  gameSlug: string
  startedAt: string
}

/** The result the server recorded for a finished run. */
export interface ScoreResponse {
  sessionId: string
  gameSlug: string
  score: number
  /** Time between starting and finishing the session, measured by the server. */
  durationMs: number
  recordedAt: string
  /** What the run earned a signed-in player; `null` for guests. */
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

export function startGameSession(gameSlug: string): Promise<GameSessionResponse> {
  return apiFetch<GameSessionResponse>('/api/game-sessions', {
    method: 'POST',
    body: { gameSlug },
    // Marks the run as this guest's, so the leaderboard can point out their scores.
    headers: playerHeaders(),
  })
}

/**
 * @param details game-specific numbers about the run (lines, highest tile, ...), used for achievements
 */
export function finishGameSession(
  sessionId: string,
  score: number,
  details: Record<string, number> = {},
): Promise<ScoreResponse> {
  return apiFetch<ScoreResponse>(`/api/game-sessions/${encodeURIComponent(sessionId)}/finish`, {
    method: 'POST',
    body: { score, details },
  })
}
