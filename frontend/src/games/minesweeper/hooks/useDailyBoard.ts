import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError } from '@/api/client'
import {
  ATTEMPT_OVER,
  fetchAttempt,
  fetchLeaderboard,
  fetchToday,
  revealCell,
  setFlag,
  startAttempt,
} from '../api/minesweeperApi'
import { canReveal, clockOffset, flagChange, serverNow, shownElapsed } from '../daily/dailyView'
import type { DailyAttempt, DailyLeaderboard, DailyToday } from '../types/dailyTypes'
import type { Tool } from './useMinesweeperGame'

/** A request still unanswered after this long is shown as slow. */
export const SLOW_AFTER_MS = 800
/** How often the shown clock and countdown move on. */
const TICK_MS = 250

export type DailyLoad = 'loading' | 'signed-out' | 'failed' | 'ready'

/** What is being asked of the server right now; only one thing at a time. */
export interface DailyPending {
  kind: 'start' | 'reveal' | 'flag'
  /** Still unanswered after {@link SLOW_AFTER_MS}. */
  slow: boolean
}

/** A request that did not get through: nothing changed on screen, and it can be sent again. */
export interface DailyFailure {
  message: string
  retry: () => void
}

export interface DailyBoardController {
  load: DailyLoad
  /** Why today's board could not be loaded, when `load` is `failed`. */
  loadError: string | null
  today: DailyToday | null
  /**
   * The attempt shown: today's, or one started before the last reset that is still being played (it
   * belongs to the day it was started on, and may be finished within its time limit).
   */
  attempt: DailyAttempt | null
  /** Whether today's attempt may be started now: signed in, none yet today, nothing else in play. */
  canStart: boolean
  pending: DailyPending | null
  failure: DailyFailure | null
  /** The attempt's time as shown: the server's once finished, an estimate while it is played. */
  elapsedMs: number
  /** Until the next board, by the server's clock. */
  untilResetMs: number
  leaderboard: DailyLeaderboard | null
  leaderboardFailed: boolean
  tool: Tool
  setTool: (tool: Tool) => void
  start: () => void
  /** A tap or left click: what the tool says. */
  act: (cell: number) => void
  reveal: (cell: number) => void
  flag: (cell: number) => void
  reload: () => void
  reloadLeaderboard: () => void
}

const messageOf = (error: unknown) =>
  error instanceof ApiError && error.status === 0
    ? "Couldn't reach the server. Check your connection and try again."
    : "The server couldn't take that just now. Try again in a moment."

const isSignedOut = (error: unknown) => error instanceof ApiError && error.status === 401

/**
 * The Daily Board, played on the server. Everything shown comes from its answers: the board, the
 * status, the time. This hook only sends the player's moves, one at a time, and keeps a clock that
 * follows the server's.
 *
 * A move that fails to get through changes nothing on screen and can be sent again as it was:
 * uncovering a cell already uncovered, or setting a flag the way it already is, changes nothing on the
 * server, so a move that did arrive is not played twice. A move refused because the attempt is over
 * brings the server's final board instead.
 */
export function useDailyBoard(onRewarded?: () => void): DailyBoardController {
  const [load, setLoad] = useState<DailyLoad>('loading')
  const [loadError, setLoadError] = useState<string | null>(null)
  const [today, setToday] = useState<DailyToday | null>(null)
  const [attempt, setAttempt] = useState<DailyAttempt | null>(null)
  const [offset, setOffset] = useState(0)
  const [deviceNow, setDeviceNow] = useState(() => Date.now())
  const [pending, setPending] = useState<DailyPending | null>(null)
  /** The request that did not get through, to send again as it was. */
  const [failed, setFailed] = useState<{ message: string; kind: DailyPending['kind']; request: () => Promise<DailyAttempt> } | null>(null)
  /** A move the server refused: nothing to send again. */
  const [refused, setRefused] = useState<string | null>(null)
  const [leaderboard, setLeaderboard] = useState<DailyLeaderboard | null>(null)
  const [leaderboardFailed, setLeaderboardFailed] = useState(false)
  const [tool, setTool] = useState<Tool>('reveal')

  /** Set at once, before any re-render, so a second click in the same instant is not sent. */
  const busy = useRef(false)
  const alive = useRef(true)
  /** The attempt as last shown, for an answer that arrives after it changed. */
  const attemptRef = useRef<DailyAttempt | null>(null)
  /** The reset already acted on, and the attempt whose deadline was already checked. */
  const resetHandled = useRef<string | null>(null)
  const deadlineChecked = useRef<string | null>(null)
  const leaderboardToken = useRef(0)

  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  useEffect(() => {
    attemptRef.current = attempt
  }, [attempt])

  const rewarded = useRef(onRewarded)
  useEffect(() => {
    rewarded.current = onRewarded
  }, [onRewarded])

  const heard = useCallback((serverTime: string) => {
    setOffset(clockOffset(serverTime, Date.now()))
    setDeviceNow(Date.now())
  }, [])

  const show = useCallback(
    (next: DailyAttempt) => {
      heard(next.serverTime)
      // The attempt shown was being played and is now a paid win (the winning answer, or the server's
      // board after that answer was lost): the player's coins and XP changed.
      const before = attemptRef.current
      if (next.status === 'WON' && next.reward && before?.id === next.id && before.status === 'PLAYING') rewarded.current?.()
      setAttempt(next)
      setToday((current) => (current && current.date === next.date ? { ...current, attempt: next } : current))
    },
    [heard],
  )

  const loadToday = useCallback(
    () =>
      fetchToday().then(
        (answer) => {
          if (!alive.current) return
          heard(answer.serverTime)
          setToday(answer)
          // An attempt from before the reset that is still being played stays on screen until it ends.
          setAttempt((current) => answer.attempt ?? (current && current.date !== answer.date && current.status === 'PLAYING' ? current : null))
          setLoad('ready')
          setLoadError(null)
        },
        (error: unknown) => {
          if (!alive.current) return
          if (isSignedOut(error)) {
            setLoad('signed-out')
            return
          }
          setLoadError(messageOf(error))
          setLoad((current) => (current === 'ready' ? current : 'failed'))
        },
      ),
    [heard],
  )

  useEffect(() => {
    void loadToday()
  }, [loadToday])

  // The clock and the countdown move on with this device's clock, set by the server's.
  useEffect(() => {
    if (load !== 'ready') return
    const timer = setInterval(() => setDeviceNow(Date.now()), TICK_MS)
    return () => clearInterval(timer)
  }, [load])

  /** Brings the attempt as the server has it now. */
  const resync = useCallback(
    (id: string) =>
      fetchAttempt(id).then(
        (answer) => {
          if (alive.current) show(answer)
        },
        (error: unknown) => {
          if (alive.current && isSignedOut(error)) setLoad('signed-out')
        },
      ),
    [show],
  )

  /** Sends one request, unless another is still on its way. */
  const send = useCallback(
    (kind: DailyPending['kind'], request: () => Promise<DailyAttempt>) => {
      if (busy.current) return
      busy.current = true
      setFailed(null)
      setRefused(null)
      setPending({ kind, slow: false })
      const slow = setTimeout(() => {
        if (alive.current) setPending((current) => (current ? { ...current, slow: true } : current))
      }, SLOW_AFTER_MS)
      const finish = () => {
        clearTimeout(slow)
        busy.current = false
        if (alive.current) setPending(null)
      }
      request().then(
        (answer) => {
          finish()
          if (alive.current) show(answer)
        },
        (error: unknown) => {
          finish()
          if (!alive.current) return
          if (isSignedOut(error)) {
            setLoad('signed-out')
            return
          }
          const current = attemptRef.current
          if (error instanceof ApiError && error.isClientError && current) {
            // Over, or otherwise refused: the server's board is the one to show.
            void resync(current.id)
            if (error.code !== ATTEMPT_OVER) setRefused("That move wasn't accepted. The board shows where things stand.")
            return
          }
          setFailed({ message: messageOf(error), kind, request })
        },
      )
    },
    [resync, show],
  )

  const now = serverNow(offset, deviceNow)
  const limitMs = today?.timeLimitMs ?? 999_999
  const elapsedMs = attempt ? shownElapsed(attempt, now, limitMs) : 0
  const untilResetMs = today ? Math.max(0, Date.parse(today.resetsAt) - now) : 0

  // Past the reset: today is a new day, with its own board.
  useEffect(() => {
    if (load !== 'ready' || !today || untilResetMs > 0 || resetHandled.current === today.resetsAt) return
    resetHandled.current = today.resetsAt
    void loadToday()
  }, [load, today, untilResetMs, loadToday])

  // Past the deadline by the shown clock: the server says how it ended.
  useEffect(() => {
    if (!attempt || attempt.status !== 'PLAYING' || deadlineChecked.current === attempt.id) return
    if (now < Date.parse(attempt.deadline)) return
    deadlineChecked.current = attempt.id
    void resync(attempt.id)
  }, [attempt, now, resync])

  const boardDate = attempt?.date ?? today?.date ?? null
  const finished = attempt !== null && attempt.status !== 'PLAYING'

  const loadLeaderboard = useCallback((date: string) => {
    const token = ++leaderboardToken.current
    const current = () => alive.current && token === leaderboardToken.current
    return fetchLeaderboard(date).then(
      (answer) => {
        if (!current()) return
        setLeaderboard(answer)
        setLeaderboardFailed(false)
      },
      () => {
        if (current()) setLeaderboardFailed(true)
      },
    )
  }, [])

  // The day's leaderboard, again whenever the attempt shown ends.
  useEffect(() => {
    if (load === 'ready' && boardDate) void loadLeaderboard(boardDate)
  }, [load, boardDate, finished, loadLeaderboard])

  const playing = attempt?.status === 'PLAYING'
  const canStart = load === 'ready' && today !== null && today.attempt === null && !playing && pending === null

  const start = () => {
    if (!canStart) return
    send('start', startAttempt)
  }
  const reveal = (cell: number) => {
    if (!attempt || !canReveal(attempt, cell)) return
    const { id } = attempt
    send('reveal', () => revealCell(id, cell))
  }
  const flag = (cell: number) => {
    if (!attempt) return
    const flagged = flagChange(attempt, cell)
    if (flagged === null) return
    const { id } = attempt
    send('flag', () => setFlag(id, cell, flagged))
  }
  const failure: DailyFailure | null = failed
    ? { message: failed.message, retry: () => send(failed.kind, failed.request) }
    : refused
      ? { message: refused, retry: () => setRefused(null) }
      : null

  return {
    load,
    loadError,
    today,
    attempt,
    canStart,
    pending,
    failure,
    elapsedMs,
    untilResetMs,
    leaderboard,
    leaderboardFailed,
    tool,
    setTool,
    start,
    act: (cell) => (tool === 'flag' ? flag(cell) : reveal(cell)),
    reveal,
    flag,
    reload: () => {
      setLoad('loading')
      void loadToday()
    },
    reloadLeaderboard: () => {
      if (boardDate) void loadLeaderboard(boardDate)
    },
  }
}
