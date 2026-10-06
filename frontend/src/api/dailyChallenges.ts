import { useQuery } from '@tanstack/react-query'
import { userKeys, useSession } from './auth'
import { apiFetch } from './client'

export interface DailyChallenge {
  id: number
  title: string
  description: string
  /** The game it is played in; `null` for a challenge about something else (an activity). */
  game: { slug: string; name: string } | null
  /** What an activity's challenge counts, e.g. `TCG_PACK_OPENED`; `null` for a game's. */
  activity: { code: string; name: string } | null
  /** The number to reach; 1 for "finish a game". */
  target: number
  xpReward: number
  coinReward: number
  /** The day it belongs to, as `YYYY-MM-DD` in UTC. */
  date: string
  /** For an activity's challenge, how far the signed-in player has got today. Absent for guests. */
  progress?: number | null
  /** Whether the signed-in player has completed it. Absent for guests. */
  completed?: boolean
  completedAt?: string | null
}

/** Opening card packs, counted by the server for the card game's daily challenges. */
export const TCG_PACK_OPENED = 'TCG_PACK_OPENED'

/** Today's challenges, as returned by `GET /api/daily-challenges` and `GET /api/daily-challenges/me`. */
export interface DailyChallengesResponse {
  date: string
  /** When today's challenges are replaced by the next set. */
  resetsAt: string
  /** How many the signed-in player has completed. Absent for guests. */
  completedCount?: number
  challenges: DailyChallenge[]
}

export const dailyChallengeKeys = {
  /** What anyone sees. */
  today: ['daily-challenges', 'today'] as const,
  /**
   * The same with the signed-in player's progress. It lives under the player's own keys, so
   * finishing a game refreshes it and signing out throws it away, like the rest of their data.
   */
  mine: [...userKeys.all, 'daily-challenges'] as const,
}

/**
 * Today's daily challenges: with progress for a signed-in player, without for a guest.
 * Which day "today" is comes from the server, never from this device's clock.
 */
export function useDailyChallenges() {
  const session = useSession()
  const signedIn = Boolean(session.user)

  const query = useQuery({
    queryKey: signedIn ? dailyChallengeKeys.mine : dailyChallengeKeys.today,
    queryFn: ({ signal }) =>
      apiFetch<DailyChallengesResponse>(signedIn ? '/api/daily-challenges/me' : '/api/daily-challenges', { signal }),
    // Wait until it is known who is asking, so a signed-in player never sees the guest view flash by.
    enabled: !session.isPending,
  })
  return { ...query, signedIn }
}
