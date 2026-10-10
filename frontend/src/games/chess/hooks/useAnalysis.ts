import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError, NETWORK_ERROR } from '@/api/client'
import { cancelReview, evaluatePosition, fetchEngineStatus, fetchReview, startReview } from '../api/chessApi'
import type { EngineStatus, EvaluationResponse, MatchView, ReviewResponse } from '../types/chessTypes'

const messageOf = (error: unknown) =>
  error instanceof ApiError && error.code !== NETWORK_ERROR ? error.message : "Couldn't reach the server. Check your connection and try again."

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
        if (!(error instanceof DOMException && error.name === 'AbortError')) setFailed(true)
      })
    return () => controller.abort()
  }, [enabled])
  return { status, failed }
}

/**
 * An evaluation of the match's current position (admins). The answer belongs to the revision it was
 * asked for: once the board moves on it is no longer shown, and an answer that arrives after that is
 * dropped. A request can be cancelled; the server's own search is bounded either way.
 */
export function useEvaluation(match: MatchView | null) {
  const [result, setResult] = useState<EvaluationResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const controller = useRef<AbortController | null>(null)
  const matchRef = useRef(match)
  useEffect(() => {
    matchRef.current = match
  }, [match])

  const evaluate = useCallback((depth: number, lines: number) => {
    const current = matchRef.current
    if (!current) return
    controller.current?.abort()
    const request = new AbortController()
    controller.current = request
    setLoading(true)
    setError(null)
    evaluatePosition(current.id, current.revision, depth, lines, request.signal)
      .then((response) => {
        const now = matchRef.current
        // Asked about a board that has changed since: not this board's evaluation.
        if (now && now.id === current.id && now.revision === response.revision) setResult(response)
      })
      .catch((failure: unknown) => {
        if (!(failure instanceof DOMException && failure.name === 'AbortError')) setError(messageOf(failure))
      })
      .finally(() => {
        if (controller.current === request) {
          controller.current = null
          setLoading(false)
        }
      })
  }, [])

  const cancel = useCallback(() => {
    controller.current?.abort()
    controller.current = null
    setLoading(false)
  }, [])

  useEffect(() => () => controller.current?.abort(), [])

  const current = result && match && result.revision === match.revision ? result : null
  return { result: current, loading, error, evaluate, cancel }
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
  const [selected, setSelected] = useState<number | null>(null)
  const matchId = match?.id ?? null

  // A review belongs to its match: another match starts without one.
  const [reviewOf, setReviewOf] = useState<string | null>(null)
  if (reviewOf !== matchId) {
    setReviewOf(matchId)
    setReview(null)
    setError(null)
    setSelected(null)
  }

  const start = useCallback(() => {
    if (!matchId) return
    setError(null)
    startReview(matchId)
      .then(setReview)
      .catch((failure: unknown) => setError(messageOf(failure)))
  }, [matchId])

  const running = review !== null && (review.status === 'QUEUED' || review.status === 'RUNNING')
  useEffect(() => {
    if (!running || !matchId) return
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      fetchReview(matchId, controller.signal)
        .then(setReview)
        .catch((failure: unknown) => {
          if (!(failure instanceof DOMException && failure.name === 'AbortError')) setError(messageOf(failure))
        })
    }, REVIEW_POLL_MS)
    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [running, matchId, review])

  const cancel = useCallback(() => {
    if (!matchId) return
    cancelReview(matchId)
      .then(setReview)
      .catch((failure: unknown) => setError(messageOf(failure)))
  }, [matchId])

  const close = useCallback(() => {
    setReview(null)
    setSelected(null)
  }, [])

  return { review, error, running, start, cancel, close, selected, select: setSelected }
}
