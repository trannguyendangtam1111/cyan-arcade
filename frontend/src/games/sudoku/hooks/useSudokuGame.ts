import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ApiError } from '@/api/client'
import type { GameProps } from '@/games/types'
import { bindSession, DAILY_ALREADY_PLAYED, fetchStats, fetchToday, HINT_UNAVAILABLE, pauseRun, resumeRun, sendMoves, startDaily, startPractice, takeHint } from '../api/sudokuApi'
import { boxOf, CELLS, colOf, conflicts, digitCounts, parseBoard, rowOf, stepFrom } from '../engine/grid'
import type { Direction } from '../engine/keys'
import {
  applyEdit,
  clearBoard,
  createBoard,
  emptyHistory,
  enterDigit,
  eraseCell,
  record,
  redo as redoEdit,
  removeNotes,
  revealCell,
  undo as undoEdit,
  valueMoves,
  type Edit,
  type History,
  type PlayBoard,
} from '../engine/play'
import type { Difficulty, HintType, HintView, RunView, StatsView, TodayView } from '../types/sudokuTypes'
import { loadNotes, saveNotes, type SudokuSettings } from './useSettings'

export type PlayMode = 'daily' | 'practice'

export interface Message {
  id: number
  text: string
  tone: 'info' | 'error' | 'success'
}

/** The player's board for one run, kept in the browser: digits as the server has them, plus notes and history. */
interface Local {
  runId: string
  board: PlayBoard
  history: History
}

type Runs = Record<PlayMode, RunView | null>
type Locals = Record<PlayMode, Local | null>

/**
 * A player's game of Sudoku. The board is edited here at once (digits, notes, undo, redo), and every
 * digit entered or cleared goes to the server, which keeps the solution, judges each digit, keeps the
 * clock and answers with the run as it stands. Calls go out one at a time, in order.
 *
 * A ranked run (daily, or practice with a score) starts with the platform's session, and the server
 * ties the two; coming back to it after a reload ties it to a new session. Once it is over, its result
 * goes to the platform through `onGameOver`, once. Relaxed practice has no session and no score.
 */
export function useSudokuGame(
  { onGameStart, onGameOver, currentSession }: Pick<GameProps, 'onGameStart' | 'onGameOver' | 'currentSession'>,
  settings: SudokuSettings,
) {
  const [today, setToday] = useState<TodayView | null>(null)
  const [loadFailed, setLoadFailed] = useState(false)
  const [stats, setStats] = useState<StatsView | null>(null)
  const [mode, setModeState] = useState<PlayMode>('daily')
  const [runs, setRuns] = useState<Runs>({ daily: null, practice: null })
  const [locals, setLocals] = useState<Locals>({ daily: null, practice: null })
  const [selected, setSelected] = useState<number | null>(null)
  const [notesMode, setNotesMode] = useState(false)
  const [fillMode, setFillMode] = useState(false)
  const [fillDigit, setFillDigit] = useState<number | null>(null)
  const [hint, setHint] = useState<HintView | null>(null)
  const [message, setMessage] = useState<Message | null>(null)
  const [busy, setBusy] = useState(false)
  const [finished, setFinished] = useState<RunView | null>(null)
  const [pop, setPop] = useState<{ cell: number; key: number } | null>(null)
  const [glow, setGlow] = useState<{ cells: Set<number>; key: number } | null>(null)
  /** When the run's clock was last read from the server, for the timer between answers. */
  const [syncedAt, setSyncedAt] = useState(() => performance.now())

  /** Runs tied to a session (or, relaxed, simply picked up) in this page; the ref for async code. */
  const bound = useRef(new Set<string>())
  const [boundIds, setBoundIds] = useState<ReadonlySet<string>>(() => new Set())
  const markBound = useCallback((id: string) => {
    bound.current.add(id)
    setBoundIds(new Set(bound.current))
  }, [])
  /** Ranked runs whose result has been handed to the platform. */
  const reported = useRef(new Set<string>())
  /** Server calls, one after another. */
  const queue = useRef<Promise<unknown>>(Promise.resolve())
  const pending = useRef(0)
  const runsRef = useRef(runs)
  useEffect(() => {
    runsRef.current = runs
  }, [runs])

  const run = runs[mode]
  const local = run && locals[mode]?.runId === run.id ? locals[mode] : null
  const playing = run?.status === 'PLAYING'
  const active = run !== null && playing && boundIds.has(run.id)
  const paused = run?.paused ?? false

  const say = useCallback((text: string, tone: Message['tone'] = 'info') => setMessage({ id: performance.now(), text, tone }), [])

  useEffect(() => {
    if (!message) return
    const timer = window.setTimeout(() => setMessage(null), 2200)
    return () => window.clearTimeout(timer)
  }, [message])

  const refreshStats = useCallback(() => {
    fetchStats()
      .then(setStats)
      .catch(() => undefined)
  }, [])

  /** Puts a run from the server in place, and its board (keeping this page's notes and history). */
  const adopt = useCallback((next: RunView, options: { board?: boolean } = {}) => {
    const key: PlayMode = next.mode === 'DAILY' ? 'daily' : 'practice'
    setRuns((current) => ({ ...current, [key]: next }))
    setSyncedAt(performance.now())
    setLocals((current) => {
      const existing = current[key]
      if (existing && existing.runId === next.id && options.board === false) return current
      const values = parseBoard(next.values)
      if (existing && existing.runId === next.id) {
        const board = createBoard(parseBoard(next.givens), values, next.revealed, existing.board.notes)
        return { ...current, [key]: { ...existing, board } }
      }
      return { ...current, [key]: { runId: next.id, board: createBoard(parseBoard(next.givens), values, next.revealed, loadNotes(next.id)), history: emptyHistory() } }
    })
  }, [])

  const load = useCallback(
    (signal?: AbortSignal) =>
      fetchToday(signal)
        .then((loaded) => {
          setToday(loaded)
          setLoadFailed(false)
          if (loaded.daily) adopt(loaded.daily)
          else setRuns((current) => ({ ...current, daily: null }))
          if (loaded.practice) adopt(loaded.practice)
        })
        .catch((error: unknown) => {
          if (!(error instanceof DOMException && error.name === 'AbortError')) setLoadFailed(true)
        }),
    [adopt],
  )

  useEffect(() => {
    const controller = new AbortController()
    void load(controller.signal)
    fetchStats(controller.signal)
      .then(setStats)
      .catch(() => undefined)
    return () => controller.abort()
  }, [load])

  // Notes are kept in this browser, per run, so a reload does not lose them.
  useEffect(() => {
    if (local) saveNotes(local.runId, local.board.notes)
  }, [local])

  /** Hands a finished ranked run's result to the platform, which submits the score. Once per run. */
  const report = useCallback(
    (over: RunView) => {
      if (!over.ranked || !over.result || over.scored || reported.current.has(over.id)) return
      reported.current.add(over.id)
      onGameOver({ score: over.result.score, durationMs: over.elapsedMs, metadata: over.result.details })
    },
    [onGameOver],
  )

  /** Opens a platform session for a ranked run: the score is submitted with it. */
  const openSession = useCallback(async (): Promise<string> => {
    onGameStart()
    const session = await currentSession?.()
    if (!session) throw new Error('The platform opened no session')
    return session.id
  }, [onGameStart, currentSession])

  // A ranked run that ended without its score reaching the platform (the page was closed in time):
  // tie it to a session now and report it, so it still counts.
  useEffect(() => {
    for (const candidate of [runs.daily, runs.practice]) {
      if (!candidate || !candidate.ranked || candidate.scored || !candidate.result) continue
      if (candidate.status !== 'SOLVED' && candidate.status !== 'FAILED') continue
      if (reported.current.has(candidate.id) || bound.current.has(candidate.id)) continue
      reported.current.add(candidate.id)
      openSession()
        .then((sessionId) => (candidate.mode === 'DAILY' ? startDaily(sessionId) : bindSession(candidate.id, sessionId)))
        .then((picked) => {
          markBound(picked.id)
          reported.current.delete(picked.id)
          report(picked)
        })
        .catch(() => undefined)
    }
  }, [runs, openSession, report, markBound])

  /** What happens when the server says a run is over. */
  const settle = useCallback(
    (next: RunView) => {
      if (next.status !== 'SOLVED' && next.status !== 'FAILED') return
      setFinished(next)
      setSelected(null)
      setFillDigit(null)
      report(next)
      if (next.ranked) refreshStats()
    },
    [report, refreshStats],
  )

  /** Runs a server call after the ones before it. Failures say so and reload the run from the server. */
  const enqueue = useCallback(
    (call: () => Promise<void>) => {
      pending.current++
      setBusy(true)
      const next = queue.current.then(call).catch((error: unknown) => {
        if (error instanceof ApiError && error.code === HINT_UNAVAILABLE) {
          say(error.message)
          return
        }
        if (error instanceof ApiError && error.code === DAILY_ALREADY_PLAYED) say("You've played today's puzzle. A new one comes at midnight UTC.")
        else say(error instanceof ApiError && error.status > 0 ? error.message : "Couldn't reach the arcade. Try again.", 'error')
        void load()
      })
      queue.current = next.finally(() => {
        pending.current--
        if (pending.current === 0) setBusy(false)
      })
      return next
    },
    [say, load],
  )

  /** Sends the board's value changes to the server; the board already shows them. */
  const sync = useCallback(
    (runId: string, moves: { cell: number; digit: number }[]) => {
      if (moves.length === 0) return
      void enqueue(async () => {
        const answer = await sendMoves(runId, moves)
        // While more moves are on their way the board is ahead of this answer: keep it.
        adopt(answer, { board: pending.current <= 1 ? undefined : false })
        settle(answer)
      })
    },
    [enqueue, adopt, settle],
  )

  /** Applies an edit to the current board, records it for undo and sends its digits to the server. */
  const edit = useCallback(
    (make: (board: PlayBoard) => Edit | null, options: { record?: boolean } = {}) => {
      if (!run || !local || !active || paused) return null
      const change = make(local.board)
      if (!change) return null
      const board = applyEdit(local.board, change)
      const history = options.record === false ? local.history : record(local.history, change)
      setLocals((current) => ({ ...current, [mode]: { ...local, board, history } }))
      sync(run.id, valueMoves(local.board, board))
      return { before: local.board, after: board }
    },
    [run, local, active, paused, mode, sync],
  )

  /** Glows the houses a placed digit completed, and pops the digit. */
  const celebrate = useCallback((board: PlayBoard, cell: number) => {
    setPop({ cell, key: performance.now() })
    const houses = [
      (other: number) => rowOf(other) === rowOf(cell),
      (other: number) => colOf(other) === colOf(cell),
      (other: number) => boxOf(other) === boxOf(cell),
    ]
    const cells = new Set<number>()
    const clash = conflicts(board.values)
    for (const inHouse of houses) {
      const members = Array.from({ length: CELLS }, (_, other) => other).filter(inHouse)
      if (members.every((other) => board.values[other] !== 0 && !clash.has(other))) members.forEach((other) => cells.add(other))
    }
    if (cells.size) setGlow({ cells, key: performance.now() })
  }, [])

  /** Enters a digit (or toggles a note) in a cell. */
  const enter = useCallback(
    (cell: number | null, digit: number, asNote = false) => {
      if (cell === null) return
      const result = edit((board) => enterDigit(board, cell, digit, notesMode || asNote, { autoRemoveNotes: settings.autoRemoveNotes }))
      if (result && !(notesMode || asNote)) celebrate(result.after, cell)
    },
    [edit, notesMode, settings.autoRemoveNotes, celebrate],
  )

  const erase = useCallback(() => {
    if (selected !== null) edit((board) => eraseCell(board, selected))
  }, [edit, selected])

  const undo = useCallback(() => {
    if (!run || !local || !active || paused) return
    const result = undoEdit(local.board, local.history)
    if (!result) return
    setLocals((current) => ({ ...current, [mode]: { ...local, board: result.board, history: result.history } }))
    sync(run.id, valueMoves(local.board, result.board))
  }, [run, local, active, paused, mode, sync])

  const redo = useCallback(() => {
    if (!run || !local || !active || paused) return
    const result = redoEdit(local.board, local.history)
    if (!result) return
    setLocals((current) => ({ ...current, [mode]: { ...local, board: result.board, history: result.history } }))
    sync(run.id, valueMoves(local.board, result.board))
  }, [run, local, active, paused, mode, sync])

  /** Clears the player's digits and notes. The clock, mistakes and hints stay: it is the same game. */
  const clearAll = useCallback(() => {
    edit((board) => clearBoard(board))
    setHint(null)
  }, [edit])

  const select = useCallback(
    (cell: number) => {
      setSelected(cell)
      if (fillMode && fillDigit !== null && local && !local.board.locked[cell]) enter(cell, fillDigit)
    },
    [fillMode, fillDigit, local, enter],
  )

  const move = useCallback((direction: Direction) => setSelected((cell) => stepFrom(cell ?? 40, direction)), [])

  /** A digit from the pad: placed in the selected cell, or, in fill mode, the digit to place. */
  const padDigit = useCallback(
    (digit: number) => {
      if (fillMode) {
        setFillDigit((current) => (current === digit ? null : digit))
        return
      }
      enter(selected, digit)
    },
    [fillMode, enter, selected],
  )

  const toggleFill = useCallback(() => {
    setFillMode((on) => !on)
    setFillDigit(null)
  }, [])

  const askHint = useCallback(
    (type: HintType) => {
      if (!run || !local || !active) return
      // A reveal goes to the chosen cell when it can still change; otherwise the hint picks one.
      const target = type === 'REVEAL' && selected !== null && !local.board.locked[selected] ? selected : undefined
      void enqueue(async () => {
        const answer = await takeHint(run.id, type, target)
        adopt(answer.run, { board: false })
        setHint(answer.hint)
        setSelected(answer.hint.cell)
        if (type === 'REVEAL') {
          setLocals((current) => {
            const mine = current[mode]
            if (!mine || mine.runId !== answer.run.id) return current
            return { ...current, [mode]: { ...mine, board: revealCell(mine.board, answer.hint.cell, answer.hint.digit) } }
          })
          setPop({ cell: answer.hint.cell, key: performance.now() })
        }
        settle(answer.run)
      })
    },
    [run, local, active, selected, enqueue, adopt, mode, settle],
  )

  /** Takes the candidates an explained hint rules out off the notes. */
  const applyHintEliminations = useCallback(() => {
    if (!hint) return
    const eliminations = hint.eliminations.map((entry) => {
      const [cell, digit] = entry.split(':').map(Number)
      return { cell, digit }
    })
    edit((board) => removeNotes(board, eliminations))
  }, [hint, edit])

  /** Starts the run of this mode: today's daily, or a new practice game. */
  const start = useCallback(
    (practice?: { difficulty: Difficulty; relaxed: boolean }) => {
      void enqueue(async () => {
        let started: RunView
        if (mode === 'daily') {
          started = await startDaily(await openSession())
        } else {
          const settingsOf = practice ?? { difficulty: 'EASY' as Difficulty, relaxed: false }
          started = await startPractice(settingsOf.difficulty, settingsOf.relaxed ? null : await openSession())
        }
        markBound(started.id)
        adopt(started)
        setSelected(null)
        setHint(null)
        setFinished(null)
        if (started.paused) adopt(await resumeRun(started.id))
      })
    },
    [enqueue, mode, openSession, adopt, markBound],
  )

  /** Picks up the run of this mode after a reload: ties it to a new session, and starts its clock again. */
  const resume = useCallback(() => {
    const current = runsRef.current[mode]
    if (!current) return
    void enqueue(async () => {
      let picked = current
      if (!bound.current.has(current.id) && current.ranked) {
        const sessionId = await openSession()
        picked = current.mode === 'DAILY' ? await startDaily(sessionId) : await bindSession(current.id, sessionId)
      }
      markBound(picked.id)
      adopt(picked.paused ? await resumeRun(picked.id) : picked)
    })
  }, [enqueue, mode, openSession, adopt, markBound])

  const pause = useCallback(() => {
    if (!run || !active || paused) return
    setRuns((current) => ({ ...current, [mode]: { ...run, paused: true, elapsedMs: run.elapsedMs + (performance.now() - syncedAt) } }))
    void enqueue(async () => adopt(await pauseRun(run.id), { board: false }))
  }, [run, active, paused, mode, syncedAt, enqueue, adopt])

  const togglePause = useCallback(() => {
    if (!run || !active) return
    if (paused) resume()
    else pause()
  }, [run, active, paused, resume, pause])

  // Leaving the page or switching tabs pauses the clock: time away is not playing time.
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState !== 'hidden') return
      const current = runsRef.current[mode]
      if (!current || current.status !== 'PLAYING' || current.paused || !bound.current.has(current.id)) return
      setRuns((all) => ({ ...all, [mode]: { ...current, paused: true } }))
      pauseRun(current.id, true).catch(() => undefined)
    }
    document.addEventListener('visibilitychange', onHide)
    return () => document.removeEventListener('visibilitychange', onHide)
  }, [mode])

  const setMode = useCallback((next: PlayMode) => {
    setModeState(next)
    setSelected(null)
    setHint(null)
    setFillDigit(null)
  }, [])

  // --- What the board shows ------------------------------------------------------------------------

  const values = useMemo(() => local?.board.values ?? Array<number>(CELLS).fill(0), [local])
  const counts = useMemo(() => digitCounts(values), [values])
  const errors = useMemo(() => {
    const marked = new Set<number>()
    if (!run || !local) return marked
    if (settings.highlightConflicts) conflicts(values).forEach((cell) => marked.add(cell))
    if (settings.showMistakes && run.ranked) {
      const serverValues = run.values
      for (const cell of run.wrong) {
        if (values[cell] !== 0 && String(values[cell]) === serverValues[cell]) marked.add(cell)
      }
    }
    return marked
  }, [run, local, values, settings.highlightConflicts, settings.showMistakes])

  const highlightDigit = fillMode && fillDigit !== null ? fillDigit : selected !== null ? values[selected] : 0

  return {
    today,
    loadFailed,
    reload: () => void load(),
    stats,
    refreshStats,
    mode,
    setMode,
    run,
    runs,
    board: local?.board ?? null,
    canUndo: (local?.history.past.length ?? 0) > 0,
    canRedo: (local?.history.future.length ?? 0) > 0,
    values,
    counts,
    errors,
    selected,
    select,
    move,
    highlightDigit,
    notesMode,
    toggleNotes: () => setNotesMode((on) => !on),
    fillMode,
    fillDigit,
    toggleFill,
    padDigit,
    enter,
    erase,
    undo,
    redo,
    clearAll,
    hint,
    dismissHint: () => setHint(null),
    askHint,
    applyHintEliminations,
    start,
    resume,
    active,
    paused,
    togglePause,
    pause,
    busy,
    message,
    finished,
    closeFinished: () => setFinished(null),
    pop,
    glow,
    syncedAt,
  }
}
