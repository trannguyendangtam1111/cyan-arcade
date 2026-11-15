import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useRef, useState } from 'react'
import { ApiError } from '@/api/client'
import {
  SCORE_REJECTED,
  SESSION_ALREADY_FINISHED,
  SESSION_EXPIRED,
  CLASSIC_MODE,
  finishGameSession,
  fetchGameSessionResult,
  modeOf,
  startGameSession,
  type GameSessionResponse,
  type Rewards,
  type ScoreResponse,
} from '@/api/gameSessions'
import { userKeys } from '@/api/auth'
import { leaderboardKeys } from '@/api/leaderboards'
import type { GameResult } from '@/games/types'

export type ScoreSubmission =
  | { status: 'idle' }
  | { status: 'saving'; score: number; recovering?: boolean }
  /** Recovered rewards describe the original save; retrieving them grants nothing more. */
  | {
      status: 'saved'
      score: number
      rewards: Rewards | null
      alreadySaved?: boolean
      recoveryError?: 'retryable' | 'unavailable'
    }
  /**
   * `rejected`: the server did not accept the run; `expired`: it was open too long; `mode-mismatch`:
   * the server opened the run under another mode than the one chosen, so its score is not sent;
   * `error`: it could not be saved for any other reason.
   */
  | { status: 'failed'; score: number; canRetry: boolean; reason: FailureReason }

export type FailureReason = 'rejected' | 'expired' | 'mode-mismatch' | 'error'

/** What a refusal from the server means for the player. */
function reasonOf(error: unknown): FailureReason {
  if (error instanceof ApiError && error.code === SCORE_REJECTED) return 'rejected'
  if (error instanceof ApiError && error.code === SESSION_EXPIRED) return 'expired'
  return 'error'
}

/**
 * How long to wait before each automatic new attempt to finish a run of a mode other than Classic,
 * when the server could not be reached or failed. Such a mode may bound its run's real time (Tetris
 * Ultra: its game time plus the pause allowance, from the session's start until the finish arrives),
 * so a score sent again much later may no longer fit; trying again at once, a few seconds in all,
 * gets past a brief outage within that bound. Safe to repeat: a session is finished at most once, and
 * an attempt that had reached the server is answered "already finished". Classic keeps its manual retry.
 */
export const FINISH_RETRY_DELAYS_MS = [1000, 3000]

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

interface Run {
  /** The mode chosen when the run started. Fixed for the whole run. */
  mode: string
  /** Resolves to the server session; rejects if it could not be created. */
  session: Promise<GameSessionResponse>
  /** Set once the run has ended. */
  result?: GameResult
  /** Set once the server has recorded the run and the game has been told (`GameResult.onSaved`). */
  confirmed?: boolean
  /** Acknowledged by the finish endpoint: subsequent attempts may only read the result. */
  alreadySaved?: boolean
  submitting?: boolean
  settled?: boolean
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
/** Finishes the session; for a mode other than Classic, tries again shortly after a failure retrying can fix. */
async function finishWithRetries(
  mode: string,
  sessionId: string,
  score: number,
  details: Record<string, number>,
  isCurrent: () => boolean,
) {
  const delays = mode === CLASSIC_MODE ? [] : FINISH_RETRY_DELAYS_MS
  for (let attempt = 0; ; attempt++) {
    try {
      return await finishGameSession(sessionId, score, details)
    } catch (error) {
      const retryable = !(error instanceof ApiError && error.isClientError)
      if (!retryable || attempt >= delays.length || !isCurrent()) throw error
      await wait(delays[attempt])
      if (!isCurrent()) throw error
    }
  }
}

export function useScoreSubmission(gameSlug: string) {
  const queryClient = useQueryClient()
  const [submission, setSubmission] = useState<ScoreSubmission>({ status: 'idle' })
  // The run currently being played or submitted. Replaced whenever a new run starts, which also
  // makes any answer still in flight for an older run irrelevant.
  const current = useRef<Run | null>(null)

  const submit = useCallback(
    async (run: Run, result: GameResult) => {
      if (run.submitting || run.settled) return
      run.submitting = true
      try {
        const { score } = result
        const isCurrent = () => current.current === run
        // Tells the game its run is recorded: once per run, and only while it is the current one, so a
        // late answer for an earlier run (or a second answer for this one) changes nothing.
        const confirm = () => {
          if (!isCurrent() || run.confirmed) return
          run.confirmed = true
          try {
            result.onSaved?.()
          } catch {
            // The game's own bookkeeping: it cannot undo the save.
          }
        }
        let refreshed = false
        const refresh = () => {
          if (refreshed) return
          refreshed = true
          void queryClient.invalidateQueries({ queryKey: leaderboardKeys.game(gameSlug) })
          void queryClient.invalidateQueries({ queryKey: userKeys.all })
        }
        const saved = (recorded?: ScoreResponse, recoveryError?: 'retryable' | 'unavailable') => {
          refresh()
          run.settled = recoveryError !== 'retryable'
          if (isCurrent()) {
            setSubmission({
              status: 'saved',
              score: recorded?.score ?? score,
              rewards: recorded?.rewards ?? null,
              ...(run.alreadySaved && { alreadySaved: true }),
              ...(recoveryError && { recoveryError }),
            })
          }
          confirm()
        }
        setSubmission({ status: 'saving', score, ...(run.alreadySaved && { recovering: true }) })

        let session: GameSessionResponse
        try {
          session = await run.session
        } catch {
          // The session never existed, so there is nothing to finish and nothing to retry.
          if (isCurrent()) setSubmission({ status: 'failed', score, canRetry: false, reason: 'error' })
          return
        }

        // A run is only ever recorded under the mode it was played in. If the server opened it under
        // another one (not what this client asked for), the score would land on the wrong board: send
        // nothing.
        if (modeOf(session) !== run.mode) {
          if (isCurrent()) setSubmission({ status: 'failed', score, canRetry: false, reason: 'mode-mismatch' })
          return
        }

        try {
          let recorded: ScoreResponse | undefined
          if (!run.alreadySaved) {
            try {
              recorded = await finishWithRetries(run.mode, session.id, score, numericDetails(result), isCurrent)
            } catch (error) {
              if (!(error instanceof ApiError && error.code === SESSION_ALREADY_FINISHED)) throw error
              run.alreadySaved = true
              // The write committed even if reading its result fails or this run is no longer shown.
              refresh()
              confirm()
            }
          }
          if (run.alreadySaved) {
            if (!isCurrent()) return
            setSubmission({ status: 'saving', score, recovering: true })
            try {
              recorded = await fetchGameSessionResult(session.id)
              if (recorded.sessionId !== session.id || recorded.gameSlug !== gameSlug || modeOf(recorded) !== run.mode) {
                throw new Error('Recovered result does not match the run')
              }
            } catch (error) {
              // A lost read never changes a confirmed save into a failed score submission. Guests
              // cannot retrieve results; retryable failures retry this GET alone, never the finish.
              saved(undefined, error instanceof ApiError && error.isClientError ? 'unavailable' : 'retryable')
              return
            }
          }
          saved(recorded)
        } catch (error) {
          if (!isCurrent()) return
          // Retrying only helps when the server was unreachable or failed, not when it said no.
          const canRetry = !(error instanceof ApiError && error.isClientError)
          setSubmission({ status: 'failed', score, canRetry, reason: reasonOf(error) })
        }
      } finally {
        run.submitting = false
      }
    },
    [gameSlug, queryClient],
  )

  const onGameStart = useCallback((requestedMode?: unknown) => {
    const mode = typeof requestedMode === 'string' ? requestedMode : CLASSIC_MODE
    const session = startGameSession(gameSlug, mode)
    // Failure is reported when the run ends; until then it must not surface as an unhandled rejection.
    session.catch(() => undefined)
    current.current = { session, mode }
    setSubmission({ status: 'idle' })
  }, [gameSlug])

  /** The session of the run started last, for a game that ties its own server state to the run. */
  const currentSession = useCallback(() => current.current?.session, [])

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

  return { submission, onGameStart, onGameOver, retry, currentSession }
}
