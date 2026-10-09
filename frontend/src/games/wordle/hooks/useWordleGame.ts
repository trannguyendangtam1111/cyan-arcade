import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError } from '@/api/client'
import type { GameProps } from '@/games/types'
import { DAILY_ALREADY_PLAYED, fetchDaily, fetchStats, HINT_UNAVAILABLE, sendGuess, startDaily, startPractice, takeHint, WORD_NOT_IN_LIST } from '../api/wordleApi'
import { applyKey, WORD_LENGTH, type KeyAction } from '../engine/board'
import type { DailyView, HintType, RunView, StatsView } from '../types/wordleTypes'

export type PlayMode = 'daily' | 'practice'

export interface Message {
  id: number
  text: string
  tone: 'info' | 'error' | 'success'
}

/** How long a tile takes to turn over for a player; the row is done after the fifth. */
export const FLIP_MS = 500
const ROW_REVEAL_MS = FLIP_MS * (1 + 0.35 * (WORD_LENGTH - 1))

const PRAISE = ['Genius!', 'Magnificent!', 'Impressive!', 'Splendid!', 'Great!', 'Phew!']

/**
 * A player's game of Word Guess. Every move goes to the server, which keeps the word and answers
 * with the run as it now stands; this keeps what is being typed, and tells the platform when a daily
 * run starts and how it ended, so its score is submitted like any game's.
 *
 * A daily run starts with the platform's session, the first time the player acts on it in this page
 * (a guess or a hint), and the server ties the two. Coming back to a daily run (after a reload) ties
 * it to a new session. A finished run whose score never reached the platform is reported on load.
 * Practice games have no session and no score.
 */
export function useWordleGame({ onGameStart, onGameOver, currentSession }: Pick<GameProps, 'onGameStart' | 'onGameOver' | 'currentSession'>) {
  const [daily, setDaily] = useState<DailyView | null>(null)
  const [loadFailed, setLoadFailed] = useState(false)
  const [stats, setStats] = useState<StatsView | null>(null)
  const [mode, setModeState] = useState<PlayMode>('daily')
  const [dailyRun, setDailyRun] = useState<RunView | null>(null)
  const [practiceRun, setPracticeRun] = useState<RunView | null>(null)
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [picking, setPicking] = useState(false)
  const [message, setMessage] = useState<Message | null>(null)
  const [shakeKey, setShakeKey] = useState(0)
  const [reveal, setReveal] = useState<{ row: number; key: number } | null>(null)
  /** The game just ended and its last row is still turning over: the result waits for it. */
  const [settling, setSettling] = useState(false)
  const [celebration, setCelebration] = useState(0)

  /** The daily run tied to a session in this page. */
  const bound = useRef<string | null>(null)
  /** Daily runs whose result has been handed to the platform. */
  const reported = useRef(new Set<string>())
  const startedAt = useRef(0)
  const busyNow = useRef(false)

  const run = mode === 'daily' ? dailyRun : practiceRun
  const over = run !== null && run.status !== 'PLAYING'

  const say = useCallback((text: string, tone: Message['tone'] = 'info') => setMessage({ id: Date.now(), text, tone }), [])

  const refreshStats = useCallback(() => {
    fetchStats()
      .then(setStats)
      .catch(() => undefined)
  }, [])

  const load = useCallback(
    (signal?: AbortSignal) =>
      fetchDaily(signal)
        .then((today) => {
          setDaily(today)
          setDailyRun(today.run)
          setLoadFailed(false)
        })
        .catch((error: unknown) => {
          if (!(error instanceof DOMException && error.name === 'AbortError')) setLoadFailed(true)
        }),
    [],
  )

  useEffect(() => {
    const controller = new AbortController()
    fetchDaily(controller.signal)
      .then((today) => {
        setDaily(today)
        setDailyRun(today.run)
      })
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === 'AbortError')) setLoadFailed(true)
      })
    fetchStats(controller.signal)
      .then(setStats)
      .catch(() => undefined)
    return () => controller.abort()
  }, [])

  useEffect(() => {
    if (!message) return
    const timer = window.setTimeout(() => setMessage(null), 1800)
    return () => window.clearTimeout(timer)
  }, [message])

  /** Ties today's run (a new one, or the player's unfinished one) to a fresh platform session. */
  const bindDaily = useCallback(async (): Promise<RunView> => {
    onGameStart()
    const session = await currentSession?.()
    if (!session) throw new Error('The platform opened no session')
    startedAt.current = performance.now()
    const started = await startDaily(session.id)
    bound.current = started.id
    setDailyRun(started)
    return started
  }, [onGameStart, currentSession])

  /** Hands a finished daily run's result to the platform, which submits the score. Once per run. */
  const report = useCallback(
    (finished: RunView) => {
      if (finished.mode !== 'DAILY' || finished.status === 'PLAYING' || !finished.result) return
      if (reported.current.has(finished.id)) return
      reported.current.add(finished.id)
      onGameOver({
        score: finished.result.score,
        durationMs: performance.now() - startedAt.current,
        metadata: finished.result.details,
      })
    },
    [onGameOver],
  )

  // A daily run that ended without its score reaching the platform (the page was closed in time):
  // tie it to a session now and report it, so the day still counts.
  useEffect(() => {
    if (!dailyRun || dailyRun.status === 'PLAYING' || dailyRun.scored) return
    if (reported.current.has(dailyRun.id) || bound.current === dailyRun.id) return
    reported.current.add(dailyRun.id)
    bindDaily()
      .then((picked) => {
        reported.current.delete(picked.id)
        report(picked)
      })
      .catch(() => undefined)
  }, [dailyRun, bindDaily, report])

  const ensureRun = useCallback(async (): Promise<RunView> => {
    if (mode === 'practice') {
      if (practiceRun && practiceRun.status === 'PLAYING') return practiceRun
      const started = await startPractice()
      setPracticeRun(started)
      return started
    }
    if (dailyRun && bound.current === dailyRun.id) return dailyRun
    return bindDaily()
  }, [mode, practiceRun, dailyRun, bindDaily])

  const store = useCallback((next: RunView) => {
    if (next.mode === 'DAILY') setDailyRun(next)
    else setPracticeRun(next)
  }, [])

  /** Runs one server move at a time; a second key press while one is on its way is ignored. */
  const act = useCallback(
    async (move: () => Promise<void>) => {
      if (busyNow.current) return
      busyNow.current = true
      setBusy(true)
      try {
        await move()
      } catch (error) {
        if (error instanceof ApiError && error.code === DAILY_ALREADY_PLAYED) {
          say("You've played today's puzzle. A new one comes at midnight UTC.")
          void load()
        } else if (error instanceof ApiError && error.code === HINT_UNAVAILABLE) {
          say(error.message)
        } else {
          say("Couldn't reach the arcade. Try again.", 'error')
        }
      } finally {
        busyNow.current = false
        setBusy(false)
      }
    },
    [say, load],
  )

  const submit = useCallback(() => {
    if (over || settling) return
    if (input.length < WORD_LENGTH) {
      setShakeKey((key) => key + 1)
      say('Not enough letters')
      return
    }
    void act(async () => {
      const current = await ensureRun()
      let next: RunView
      try {
        next = await sendGuess(current.id, input)
      } catch (error) {
        if (error instanceof ApiError && error.code === WORD_NOT_IN_LIST) {
          setShakeKey((key) => key + 1)
          say('Not in the word list')
          return
        }
        throw error
      }
      store(next)
      setInput('')
      setReveal({ row: next.guesses.length - 1, key: Date.now() })
      if (next.status !== 'PLAYING') {
        setSettling(true)
        window.setTimeout(() => {
          setSettling(false)
          if (next.status === 'SOLVED') {
            setCelebration((count) => count + 1)
            say(PRAISE[next.guesses.length - 1], 'success')
          }
          if (next.mode === 'DAILY') refreshStats()
        }, ROW_REVEAL_MS)
        report(next)
      }
    })
  }, [over, settling, input, act, ensureRun, store, say, report, refreshStats])

  const hint = useCallback(
    (type: HintType, letter?: string) => {
      if (over) return
      if (type === 'CHECK_LETTER' && !letter) {
        setPicking((value) => !value)
        return
      }
      setPicking(false)
      void act(async () => {
        const current = await ensureRun()
        store(await takeHint(current.id, type, letter))
      })
    },
    [over, act, ensureRun, store],
  )

  /** A key from the physical or the on-screen keyboard. */
  const press = useCallback(
    (action: KeyAction) => {
      if (over || busyNow.current) return
      if (picking) {
        if (action.kind === 'letter') hint('CHECK_LETTER', action.letter)
        else setPicking(false)
        return
      }
      if (action.kind === 'enter') submit()
      else setInput((current) => applyKey(current, action))
    },
    [over, picking, hint, submit],
  )

  const setMode = useCallback((next: PlayMode) => {
    setModeState(next)
    setInput('')
    setPicking(false)
    setReveal(null)
  }, [])

  /** A new practice game; it starts with its first guess or hint. */
  const newPractice = useCallback(() => {
    setPracticeRun(null)
    setMode('practice')
  }, [setMode])

  return {
    daily,
    loadFailed,
    reload: () => void load(),
    stats,
    mode,
    setMode,
    run,
    dailyRun,
    over,
    input,
    busy,
    picking,
    cancelPicking: () => setPicking(false),
    message,
    shakeKey,
    reveal,
    settling,
    celebration,
    press,
    hint,
    newPractice,
  }
}
