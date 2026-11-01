import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError, NETWORK_ERROR } from '@/api/client'
import { cancelReview, evaluatePosition, fetchEngineStatus, fetchReview, STALE_REVISION, startReview } from '../api/chessApi'
import type { EngineStatus, EvaluationResponse, MatchView, ReviewResponse } from '../types/chessTypes'

const messageOf = (error: unknown) =>
  error instanceof ApiError && error.code !== NETWORK_ERROR ? error.message : "Couldn't reach the server. Check your connection and try again."

const aborted = (error: unknown) => error instanceof DOMException && error.name === 'AbortError'

/** What the engine offers (admins): read once, when AI mode is on. */
export function useEngineStatus(enabled: boolean) {
  const [status, setStatus] = useState<EngineStatus | null>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    if (!enabled) return
    const controller = new AbortController()
    fetchEngineStatus(controller.signal)
      .then((loaded) => {
        setStatus(loaded)
        setFailed(false)
      })
      .catch((error: unknown) => {
        if (!aborted(error)) setFailed(true)
      })
    return () => controller.abort()
  }, [enabled])
  return { status, failed }
}

/** How long the board must stay on a position before it is analysed (stepping through moves fast). */
export const ANALYSIS_DELAY_MS = 250

/** Why an evaluation went wrong, for whoever is debugging it (development builds only). */
function report(what: string, details: Record<string, unknown>) {
  if (import.meta.env.DEV && import.meta.env.MODE !== 'test') console.warn(`[chess] ${what}`, details)
}

interface EvaluationOptions {
  /**
   * Evaluate without being asked (the evaluation bar is on): until the player stops it, every position
   * the board shows is evaluated. Without it, analysis waits for `start`.
   */
  auto?: boolean
  /** The server says the match has moved on (another tab, a late move): bring it up to date. */
  onStale?: () => void
}

/**
 * Engine analysis (admins) of the position on the board. Each answer is kept under the position it is
 * for (its FEN) and the depth and lines asked, so it is shown only for that position, never for
 * another, and a position seen again is not searched again. One request at a time: moving on cancels
 * the one in flight. Everything is searched on the server, through its engine pool and limits, for a
 * position of the match it keeps (the request names a ply, not a position).
 *
 * It runs while started, or while `auto` and not stopped; it searches only while `searching` (the
 * panel or the bar is shown). An answer for an older revision of the match (409) is not an error:
 * the match is brought up to date and its position asked about again. Any other failure is kept for
 * that position and shown, with `retry`.
 */
export function useEvaluation(match: MatchView | null, position: { ply: number; fen: string } | null, depth: number, lines: number, searching = true, options: EvaluationOptions = {}) {
  const [choice, setChoice] = useState<'auto' | 'on' | 'off'>('auto')
  const running = choice === 'on' || (choice === 'auto' && options.auto === true)
  const [results, setResults] = useState<ReadonlyMap<string, EvaluationResponse>>(new Map())
  const [failure, setFailure] = useState<{ key: string; message: string } | null>(null)
  const [stale, setStale] = useState<{ key: string; revision: number } | null>(null)
  const onStale = useRef(options.onStale)
  useEffect(() => {
    onStale.current = options.onStale
  }, [options.onStale])
  // A game ended by resigning or agreement keeps its last FEN: its final position is then its result,
  // never the search made of that FEN while the game was on.
  const ended = match?.result && position?.ply === match.history.length ? match.result.termination : ''
  const key = position ? `${position.fen}|${depth}|${lines}|${ended}` : null
  const matchId = match?.id ?? null
  const revision = match?.revision ?? null
  const ply = position?.ply ?? null
  const have = key !== null && results.has(key)
  const failedHere = failure !== null && failure.key === key
  const staleHere = stale !== null && stale.key === key && stale.revision === revision

  useEffect(() => {
    if (!running || !searching || key === null || matchId === null || revision === null || ply === null || have || failedHere || staleHere) return
    const controller = new AbortController()
    const behind = () => {
      // The match changed on the server: wait for it to be brought up to date, then ask again.
      setStale({ key, revision })
      onStale.current?.()
    }
    const timer = window.setTimeout(() => {
      evaluatePosition(matchId, revision, depth, lines, ply, controller.signal)
        .then((response) => {
          // Only the answer for the position asked about, at the revision it was asked in.
          if (response.revision === revision && response.ply === ply) setResults((all) => new Map(all).set(key, response))
          else {
            report('evaluation answered for another position', { asked: { revision, ply }, answered: { revision: response.revision, ply: response.ply } })
            behind()
          }
        })
        .catch((error: unknown) => {
          if (aborted(error)) return
          if (error instanceof ApiError && error.code === STALE_REVISION) {
            report('evaluation asked for an old revision; reloading the match', { matchId, revision, ply })
            behind()
            return
          }
          report('evaluation failed', { matchId, revision, ply, depth, lines, error })
          setFailure({ key, message: messageOf(error) })
        })
    }, ANALYSIS_DELAY_MS)
    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [running, searching, key, matchId, revision, ply, depth, lines, have, failedHere, staleHere])

  const start = useCallback(() => {
    setFailure(null)
    setStale(null)
    setChoice('on')
  }, [])
  const stop = useCallback(() => setChoice('off'), [])
  const retry = useCallback(() => {
    setFailure(null)
    setStale(null)
  }, [])

  const result = key !== null ? (results.get(key) ?? null) : null
  return {
    result,
    running,
    /** Stopped by the player (not merely never started). */
    stopped: choice === 'off',
    loading: running && searching && key !== null && !result && !failedHere,
    error: failedHere ? failure.message : null,
    start,
    stop,
    retry,
  }
}

/** How often a running review is asked about. */
export const REVIEW_POLL_MS = 800

/**
 * A game review (admins): started on the server, asked about until it is done, cancellable. Moves
 * appear as their analysis arrives; nothing is shown as analysed before the server says so.
 */
export function useReview(match: MatchView | null) {
  const [review, setReview] = useState<ReviewResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const matchId = match?.id ?? null
  const current = useRef(matchId)
  useEffect(() => {
    current.current = matchId
  }, [matchId])

  // A review belongs to its match: another match starts without one.
  const [reviewOf, setReviewOf] = useState<string | null>(null)
  if (reviewOf !== matchId) {
    setReviewOf(matchId)
    setReview(null)
    setError(null)
  }

  /** Keeps an answer only while its match is the one shown. */
  const keep = useCallback((response: ReviewResponse) => {
    if (response.matchId === current.current) setReview(response)
  }, [])

  const start = useCallback(() => {
    if (!matchId) return
    setError(null)
    startReview(matchId)
      .then(keep)
      .catch((failure: unknown) => setError(messageOf(failure)))
  }, [keep, matchId])

  const running = review !== null && (review.status === 'QUEUED' || review.status === 'RUNNING')
  useEffect(() => {
    if (!running || !matchId) return
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      fetchReview(matchId, controller.signal)
        .then(keep)
        .catch((failure: unknown) => {
          if (!aborted(failure)) setError(messageOf(failure))
        })
    }, REVIEW_POLL_MS)
    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [running, matchId, review, keep])

  const cancel = useCallback(() => {
    if (!matchId) return
    cancelReview(matchId)
      .then(keep)
      .catch((failure: unknown) => setError(messageOf(failure)))
  }, [keep, matchId])

  const close = useCallback(() => setReview(null), [])

  return { review, error, running, start, cancel, close }
}
