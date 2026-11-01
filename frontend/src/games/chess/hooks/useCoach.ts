import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ApiError, NETWORK_ERROR } from '@/api/client'
import { COACH_MOVE_GONE, requestCoach } from '../api/chessApi'
import type { MoveLabel } from '../components/MoveList'
import type { Evaluation, MatchView, ReviewedMove } from '../types/chessTypes'

/** One move's judgement, or where it stands. */
export interface CoachEntry {
  status: 'pending' | 'done' | 'failed' | 'limited'
  move: ReviewedMove | null
  error: string | null
}

const keyOf = (matchId: string, ply: number, uci: string) => `${matchId}:${ply}:${uci}`

/** Moves the coach judges: the player's own (in a game against Stockfish, not the engine's). */
function judgedSide(match: MatchView, ply: number): boolean {
  const mover = ply % 2 === 1 ? 'WHITE' : 'BLACK'
  return !match.engine || match.engine.side !== mover
}

/**
 * Coach Mode: Stockfish's judgement of each move as it is played, asked of the server one move at a
 * time (the newest first) and never blocking the board. A judgement is kept under its match, ply and
 * move, so one that arrives after a takeback, a new game or a different move at that ply is never
 * shown for the wrong move. Moves played before Coach Mode was turned on are not judged, apart from
 * the latest one, so turning it on does not send a burst of requests.
 */
export function useCoach(match: MatchView | null, enabled: boolean) {
  const [entries, setEntries] = useState<ReadonlyMap<string, CoachEntry>>(new Map())
  const [queue, setQueue] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const seen = useRef<{ matchId: string; plies: number } | null>(null)
  /** The judgement in flight. It is given up only when the page goes, never because state changed. */
  const inFlight = useRef<AbortController | null>(null)
  const matchRef = useRef(match)
  const entriesRef = useRef(entries)
  useEffect(() => {
    matchRef.current = match
    entriesRef.current = entries
  }, [match, entries])

  const allowed = enabled && match !== null && match.hints.allowed
  const matchId = match?.id ?? null
  const plies = match?.history.length ?? 0

  // New moves (and, when Coach Mode starts, the latest one) join the queue. Only the match and its
  // number of moves decide; the rest of it is read through the ref.
  useEffect(() => {
    const match = matchRef.current
    if (!allowed || !match || match.id !== matchId) {
      seen.current = null
      return
    }
    const before = seen.current && seen.current.matchId === match.id ? seen.current.plies : Math.max(0, match.history.length - 1)
    seen.current = { matchId: match.id, plies: match.history.length }
    const fresh = match.history
      .slice(Math.min(before, match.history.length))
      .filter((move) => judgedSide(match, move.ply))
      .map((move) => keyOf(match.id, move.ply, move.uci))
    if (fresh.length === 0) return
    setQueue((current) => [...current.filter((key) => !fresh.includes(key)), ...fresh])
    setEntries((current) => {
      const next = new Map(current)
      for (const key of fresh) if (!next.has(key)) next.set(key, { status: 'pending', move: null, error: null })
      return next
    })
  }, [allowed, matchId, plies])

  // One judgement at a time, the newest first; a move no longer in the game is dropped unasked.
  useEffect(() => {
    if (!allowed || busy || queue.length === 0) return
    const key = queue[queue.length - 1]
    const [id, plyText, uci] = key.split(':')
    const ply = Number(plyText)
    const current = matchRef.current
    if (!current || current.id !== id || current.history[ply - 1]?.uci !== uci || entriesRef.current.get(key)?.status === 'done') {
      setQueue((pending) => pending.filter((item) => item !== key))
      return
    }
    const controller = new AbortController()
    inFlight.current = controller
    setBusy(true)
    requestCoach(id, ply, uci, controller.signal)
      .then((response) => {
        setEntries((all) => new Map(all).set(key, { status: 'done', move: response.move, error: null }))
      })
      .catch((failure: unknown) => {
        if (failure instanceof DOMException && failure.name === 'AbortError') return
        if (failure instanceof ApiError && failure.code === COACH_MOVE_GONE) {
          setEntries((all) => {
            const next = new Map(all)
            next.delete(key)
            return next
          })
          return
        }
        const limited = failure instanceof ApiError && failure.status === 429
        const message = failure instanceof ApiError && failure.code !== NETWORK_ERROR ? failure.message : "Couldn't reach the server."
        setEntries((all) => new Map(all).set(key, { status: limited ? 'limited' : 'failed', move: null, error: message }))
      })
      .finally(() => {
        if (inFlight.current === controller) inFlight.current = null
        setQueue((pending) => pending.filter((item) => item !== key))
        setBusy(false)
      })
  }, [allowed, busy, queue])

  useEffect(() => () => inFlight.current?.abort(), [])

  /** Asks again about a move whose judgement failed or was refused by the limit. */
  const retry = useCallback((ply: number) => {
    const current = matchRef.current
    const move = current?.history[ply - 1]
    if (!current || !move) return
    const key = keyOf(current.id, ply, move.uci)
    setEntries((all) => new Map(all).set(key, { status: 'pending', move: null, error: null }))
    setQueue((pending) => [...pending.filter((item) => item !== key), key])
  }, [])

  /** What is known about each move of the game as it stands now. */
  const byPly = useMemo(() => {
    const result = new Map<number, CoachEntry>()
    if (!match) return result
    for (const move of match.history) {
      const entry = entries.get(keyOf(match.id, move.ply, move.uci))
      if (entry) result.set(move.ply, entry)
    }
    return result
  }, [entries, match])

  const labels = useMemo(() => {
    const result = new Map<number, MoveLabel>()
    for (const [ply, entry] of byPly) result.set(ply, { classification: entry.move?.classification ?? null, pending: entry.status === 'pending' })
    return result
  }, [byPly])

  /**
   * The engine's evaluation of the position after `ply` moves, from a judgement that covers it (the
   * move that led there, or the next move's position before), else `null`.
   */
  const evaluationAt = useCallback(
    (ply: number): Evaluation | null => byPly.get(ply)?.move?.after ?? byPly.get(ply + 1)?.move?.before ?? null,
    [byPly],
  )

  return { allowed, byPly, labels, evaluationAt, retry, busy }
}
