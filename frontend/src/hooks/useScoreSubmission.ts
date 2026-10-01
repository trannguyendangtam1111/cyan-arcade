import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useRef, useState } from 'react'
import { ApiError } from '@/api/client'
import {
  SESSION_ALREADY_FINISHED,
  finishGameSession,
  startGameSession,
  type GameSessionResponse,
  type Rewards,
} from '@/api/gameSessions'
import { userKeys } from '@/api/auth'
import { leaderboardKeys } from '@/api/leaderboards'
import type { GameResult } from '@/games/types'

export type ScoreSubmission =
  | { status: 'idle' }
  | { status: 'saving'; score: number }
  | { status: 'saved'; score: number; rewards: Rewards | null }
  | { status: 'failed'; score: number; canRetry: boolean }

interface Run {
  /** Resolves to the server session; rejects if it could not be created. */
  session: Promise<GameSessionResponse>
  /** Set once the run has ended. */
  result?: GameResult
}

/** The whole-number details a game reported about its run, in the shape the API accepts. */
function numericDetails(result: GameResult): Record<string, number> {
  const details: Record<string, number> = {}
  for (const [name, value] of Object.entries(result.metadata ?? {})) {
    if (typeof value === 'number' && Number.isInteger(value) && value >= 0) details[name] = value
  }
  return details
}

/**
 * The platform side of score keeping, shared by every game.
 *
 * A game only reports "a run started" and "the run ended with this result". This hook turns that
 * into the server flow: open a session at the start, finish it with the score at the end. Games
 * never talk to the API themselves, so all score submission stays in one place.
 */
export function useScoreSubmission(gameSlug: string) {
  const queryClient = useQueryClient()
  const [submission, setSubmission] = useState<ScoreSubmission>({ status: 'idle' })
  // The run currently being played or submitted. Replaced whenever a new run starts, which also
  // makes any answer still in flight for an older run irrelevant.
  const current = useRef<Run | null>(null)

  const submit = useCallback(
    async (run: Run, result: GameResult) => {
      const { score } = result
      const isCurrent = () => current.current === run
      setSubmission({ status: 'saving', score })

      let session: GameSessionResponse
      try {
        session = await run.session
      } catch {
        // The session never existed, so there is nothing to finish and nothing to retry.
        if (isCurrent()) setSubmission({ status: 'failed', score, canRetry: false })
        return
      }

      try {
        const recorded = await finishGameSession(session.id, score, numericDetails(result))
        // The leaderboard has a new entry, and a signed-in player's XP, history and achievements
        // have changed, whether or not the player is still looking at this run.
        void queryClient.invalidateQueries({ queryKey: leaderboardKeys.game(gameSlug) })
        void queryClient.invalidateQueries({ queryKey: userKeys.all })
        if (isCurrent()) setSubmission({ status: 'saved', score, rewards: recorded.rewards ?? null })
      } catch (error) {
        if (!isCurrent()) return
        // "Already finished" means an earlier attempt did reach the server: the score is recorded.
        const alreadySaved = error instanceof ApiError && error.code === SESSION_ALREADY_FINISHED
        // Retrying only helps when the server was unreachable or failed, not when it said no.
        const canRetry = !(error instanceof ApiError && error.isClientError)
        setSubmission(alreadySaved ? { status: 'saved', score, rewards: null } : { status: 'failed', score, canRetry })
      }
    },
    [gameSlug, queryClient],
  )

  const onGameStart = useCallback(() => {
    const session = startGameSession(gameSlug)
    // Failure is reported when the run ends; until then it must not surface as an unhandled rejection.
    session.catch(() => undefined)
    current.current = { session }
    setSubmission({ status: 'idle' })
  }, [gameSlug])

  const onGameOver = useCallback(
    (result: GameResult) => {
      const run = current.current
      // Without a started run there is no session to attach the score to, and a run reports once.
      if (!run || run.result !== undefined) return
      run.result = result
      void submit(run, result)
    },
    [submit],
  )

  const retry = useCallback(() => {
    const run = current.current
    if (run?.result !== undefined) void submit(run, run.result)
  }, [submit])

  return { submission, onGameStart, onGameOver, retry }
}
