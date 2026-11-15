import type { MockHandler } from './mockApi'
import { mockJson, mockProblem } from './mockApi'

/**
 * A small stand-in for Sudoku's server, for tests: one puzzle and its solution, daily and practice
 * runs, digits judged by the solution, hints, pauses and the admin AI. The real rules and scores are
 * the server's; this keeps just enough to drive the screen.
 */

export const SOLVED = '534678912672195348198342567859761423426853791713924856961537284287419635345286179'
export const PUZZLE = '530070000600195000098000060800060003400803001700020006060000280000419005000080079'
/** The solution with only r1c3 (4) and r1c4 (6) left to fill. */
export const NEARLY_DONE = '530' + '0' + SOLVED.slice(4)

interface FakeRun {
  id: string
  mode: 'DAILY' | 'PRACTICE' | 'ARCHIVE'
  /** An archive replay's puzzle date and number. */
  date?: string
  puzzleNumber?: number
  ranked: boolean
  difficulty: string
  givens: string
  values: number[]
  revealed: number[]
  mistakes: number
  hints: { type: string; cell: number }[]
  paused: boolean
  sessionId: string | null
  scored: boolean
  abandoned: boolean
}

export interface SudokuServerOptions {
  /** The daily puzzle's clues. */
  givens?: string
  /** Today's daily run, already started. */
  daily?: { values?: string; paused?: boolean; scored?: boolean } | null
  /** A practice game in progress. */
  practice?: { values?: string; ranked?: boolean } | null
  stats?: Record<string, unknown>
  /**
   * The Daily history: 30 UTC dates ending `today` (2026-10-09 unless named), each not attempted
   * unless `days` says otherwise. Left out: a solve two days back and yesterday, and a failure four
   * days back. Guests get 401.
   */
  history?: { today?: string; days?: Record<string, Record<string, unknown>> }
  /**
   * The archive: past Daily puzzles from 2026-01-01 to yesterday (2026-10-08), each Hard with these
   * clues (default PUZZLE), and a replay in progress if `archive` is set.
   */
  archiveGivens?: string
  archive?: { date: string; values?: string } | null
  /** Pencil marks already saved on the server, by run id (as from another device). */
  notes?: Record<string, FakeNotes>
  /** Notes reads wait for `releaseNotes()` before they answer, as on a slow network. */
  holdNotes?: boolean
}

/** A run's saved pencil marks, as the server keeps them for a signed-in player. */
export interface FakeNotes {
  revision: number
  cells: { cell: number; digits: number[] }[]
}

/** The fake's puzzle number of a date, as the server counts: 2026-01-01 is #1. */
export const archiveNumber = (date: string) => Math.round((Date.parse(`${date}T00:00:00Z`) - Date.UTC(2026, 0, 1)) / (24 * 60 * 60_000)) + 1

const FIRST_DAILY = Date.UTC(2026, 0, 1)
const DAY_MS = 24 * 60 * 60_000

const DEFAULT_HISTORY: Record<string, Record<string, unknown>> = {
  '2026-10-05': { status: 'FAILED', difficulty: 'EXPERT', seconds: 1312, mistakes: 3, hints: 2 },
  '2026-10-07': { status: 'COMPLETED', difficulty: 'MEDIUM', seconds: 498, mistakes: 1, hints: 0, streak: 1 },
  '2026-10-08': { status: 'COMPLETED', difficulty: 'EASY', seconds: 215, mistakes: 0, hints: 1, streak: 2 },
}

export function dailyHistory({ today = '2026-10-09', days = DEFAULT_HISTORY }: NonNullable<SudokuServerOptions['history']>) {
  const end = Date.parse(`${today}T00:00:00Z`)
  const list = Array.from({ length: 30 }, (_, index) => {
    const time = end - (29 - index) * DAY_MS
    const date = new Date(time).toISOString().slice(0, 10)
    const number = time < FIRST_DAILY ? null : Math.round((time - FIRST_DAILY) / DAY_MS) + 1
    const base = { date, puzzleNumber: number, difficulty: number === null ? null : 'MEDIUM', status: number === null ? 'NO_PUZZLE' : 'NOT_ATTEMPTED', seconds: null, mistakes: null, hints: null, streak: null }
    return { ...base, ...days[date] }
  })
  return { from: list[0].date, today, days: list }
}

const PERCENTS = [100, 90, 75, 60]
const DIFFICULTIES = [
  { id: 'EASY', label: 'Easy', level: 1, baseScore: 1000, parSeconds: 360 },
  { id: 'MEDIUM', label: 'Medium', level: 2, baseScore: 2000, parSeconds: 600 },
  { id: 'HARD', label: 'Hard', level: 3, baseScore: 3500, parSeconds: 900 },
  { id: 'EXPERT', label: 'Expert', level: 4, baseScore: 5000, parSeconds: 1500 },
]

const modeStats = (played: number, completed: number) => ({
  played,
  completed,
  winRate: played ? Math.round((100 * completed) / played) : 0,
  averageSeconds: completed ? 412 : null,
  averageMistakes: completed ? 0.5 : null,
  averageHints: completed ? 1 : null,
  bestSeconds: { EASY: completed ? 215 : null, MEDIUM: null, HARD: completed ? 380 : null, EXPERT: null },
})

export function sudokuServer({ givens = PUZZLE, daily = null, practice = null, stats = {}, history = {}, archiveGivens = PUZZLE, archive = null, notes = {}, holdNotes = false }: SudokuServerOptions = {}) {
  const runs = new Map<string, FakeRun>()
  const calls: { method: string; path: string; body: Record<string, unknown> | undefined }[] = []
  const savedNotes = new Map<string, FakeNotes>(Object.entries(notes))
  /** Whoever is asking: a signed-in player's runs keep their notes on the server. */
  let signedIn = false
  /** While set, notes requests fail as if the network were down. */
  let notesOffline = false
  let releaseNotes = () => {}
  const notesHeld = holdNotes ? new Promise<void>((resolve) => (releaseNotes = resolve)) : null
  /** While set, notes saves are done at once but their answers wait for `releaseSaves()`. */
  let savesHeld: Promise<void> | null = null
  let releaseSaves = () => {}
  let practiceCount = 0
  let archiveCount = 0

  const make = (id: string, mode: FakeRun['mode'], ranked: boolean, difficulty: string, clues: string, values?: string): FakeRun => ({
    id,
    mode,
    ranked,
    difficulty,
    givens: clues,
    values: Array.from(values ?? clues, Number),
    revealed: [],
    mistakes: 0,
    hints: [],
    paused: false,
    sessionId: null,
    scored: false,
    abandoned: false,
  })

  let dailyRun: FakeRun | null = daily ? { ...make('daily-run', 'DAILY', true, 'HARD', givens, daily.values), paused: daily.paused ?? false, scored: daily.scored ?? false, sessionId: 'old-session' } : null
  if (dailyRun) runs.set(dailyRun.id, dailyRun)
  let practiceRun: FakeRun | null = practice ? make('practice-0', 'PRACTICE', practice.ranked ?? true, 'MEDIUM', PUZZLE, practice.values) : null
  if (practiceRun) runs.set(practiceRun.id, practiceRun)
  let archiveRun: FakeRun | null = archive
    ? { ...make('archive-0', 'ARCHIVE', false, 'HARD', archiveGivens, archive.values), date: archive.date, puzzleNumber: archiveNumber(archive.date) }
    : null
  if (archiveRun) runs.set(archiveRun.id, archiveRun)
  const inArchive = (date: string) => /^\d{4}-\d{2}-\d{2}$/.test(date) && date >= '2026-01-01' && date < '2026-10-09'

  const status = (run: FakeRun) => {
    if (run.abandoned) return 'ABANDONED'
    if (run.values.join('') === SOLVED) return 'SOLVED'
    return run.ranked && run.mistakes >= 3 ? 'FAILED' : 'PLAYING'
  }

  const view = (run: FakeRun) => {
    const state = status(run)
    const solved = state === 'SOLVED'
    const over = state === 'SOLVED' || state === 'FAILED'
    const percent = PERCENTS[run.hints.length]
    const score = solved && run.ranked ? Math.floor((3500 * 150 * (100 - 15 * run.mistakes) * percent) / 1_000_000) : 0
    const level = DIFFICULTIES.find((info) => info.id === run.difficulty)?.level ?? 1
    return {
      id: run.id,
      mode: run.mode,
      ranked: run.ranked,
      difficulty: run.difficulty,
      puzzleNumber: run.puzzleNumber ?? (run.mode === 'DAILY' ? 282 : null),
      date: run.date ?? (run.mode === 'DAILY' ? '2026-10-09' : null),
      status: state,
      givens: run.givens,
      values: run.values.join(''),
      revealed: run.revealed,
      wrong: run.ranked ? run.values.flatMap((value, cell) => (value !== 0 && String(value) !== SOLVED[cell] ? [cell] : [])) : [],
      mistakes: run.mistakes,
      mistakeRule: run.ranked ? 'SOLUTION' : 'CONFLICT',
      mistakeLimit: run.ranked ? 3 : 0,
      hintsUsed: run.hints.length,
      hintsLeft: 3 - run.hints.length,
      hints: run.hints,
      elapsedMs: 65_000,
      paused: run.paused,
      solution: over ? SOLVED : null,
      result:
        over && run.ranked
          ? {
              score,
              seconds: 65,
              timePercent: 150,
              mistakePercent: 100 - 15 * run.mistakes,
              hintPercent: percent,
              details: {
                difficulty: level,
                seconds: 65,
                mistakes: run.mistakes,
                hints: run.hints.length,
                solvedLevel: solved ? level : 0,
                flawless: solved && run.mistakes === 0 ? level : 0,
                cleanSolve: solved && run.hints.length === 0 ? level : 0,
                speedSolve: solved ? 1 : 0,
                streak: solved && run.mode === 'DAILY' ? 1 : 0,
                dailyGrade: solved && run.mode === 'DAILY' ? 4 : 0,
              },
            }
          : null,
      scored: run.scored,
      notesSync: signedIn,
    }
  }

  const today = () => ({
    puzzleNumber: 282,
    date: '2026-10-09',
    difficulty: 'HARD',
    nextPuzzleAt: new Date(Date.now() + 3 * 60 * 60_000).toISOString(),
    maxHints: 3,
    mistakeLimit: 3,
    hintPercents: PERCENTS,
    difficulties: DIFFICULTIES,
    daily: dailyRun ? view(dailyRun) : null,
    practice: practiceRun && status(practiceRun) === 'PLAYING' ? view(practiceRun) : null,
    archive: archiveRun && status(archiveRun) === 'PLAYING' ? view(archiveRun) : null,
  })

  const solution = (strategy: string, puzzle: Record<string, unknown> | undefined) => ({
    strategy,
    date: puzzle?.difficulty ? null : '2026-10-09',
    puzzleNumber: puzzle?.difficulty ? null : 282,
    difficulty: (puzzle?.difficulty as string) ?? 'HARD',
    seed: 42,
    givens: NEARLY_DONE,
    solution: SOLVED,
    moves: [
      ...(strategy === 'TEACHING'
        ? [{ kind: 'ELIMINATE', cell: -1, digit: 0, eliminations: ['2:1'], cleared: [], technique: 'LOCKED_CANDIDATES', text: 'Locked candidates: pointing.', lesson: ['Locked candidates: pointing.', 'Removes 1 from r1c3.'], highlight: [2] }]
        : []),
      ...(strategy === 'FAST' ? [{ kind: 'GUESS', cell: 2, digit: 4, eliminations: [], cleared: [], technique: null, text: 'Trying 4 in r1c3 (2 options).', lesson: [], highlight: [2] }] : []),
      ...(strategy !== 'FAST' ? [{ kind: 'PLACE', cell: 2, digit: 4, eliminations: [], cleared: [], technique: 'FULL_HOUSE', text: 'Full house: r1c3 takes the missing 4.', lesson: strategy === 'TEACHING' ? ['Full house: r1c3 takes the missing 4.', 'Row 1 has 5, 3.'] : [], highlight: [0, 1, 2] }] : []),
      { kind: 'PLACE', cell: 3, digit: 6, eliminations: [], cleared: [], technique: strategy === 'FAST' ? null : 'FULL_HOUSE', text: 'Full house: r1c4 takes the missing 6.', lesson: [], highlight: [3] },
    ],
    guesses: strategy === 'FAST' ? 1 : 0,
    backtracks: 0,
    techniques: strategy === 'FAST' ? {} : { FULL_HOUSE: 2 },
    searched: 0,
    trimmed: false,
    millis: 4,
  })

  const handler: MockHandler = ({ path, method, body, user }) => {
    if (!path.startsWith('/api/sudoku/') && !path.startsWith('/api/ai/sudoku/')) return undefined
    calls.push({ method, path, body })
    signedIn = user !== null

    if (path.startsWith('/api/ai/sudoku/')) {
      if (!user) return mockProblem(401, 'UNAUTHORIZED', 'Authentication is required')
      if (user.role !== 'ADMIN') return mockProblem(403, 'FORBIDDEN', 'You are not allowed to do this')
      return mockJson(solution(String(body?.strategy), body))
    }
    if (method === 'GET' && path === '/api/sudoku/today') return mockJson(today())
    if (method === 'GET' && path === '/api/sudoku/stats') {
      return mockJson({ daily: modeStats(4, 3), practice: modeStats(2, 1), currentStreak: 2, bestStreak: 5, lastDaily: '2026-10-08', ...stats })
    }
    const archiveDate = path.match(/^\/api\/sudoku\/archive\/([^/]+)$/)
    if (method === 'GET' && archiveDate) {
      const date = decodeURIComponent(archiveDate[1])
      if (!inArchive(date)) return mockProblem(404, 'NOT_IN_ARCHIVE', date >= '2026-10-09' ? 'That Daily puzzle has not come out yet' : 'The Daily Sudoku began on 2026-01-01: there is no puzzle before')
      return mockJson({ date, puzzleNumber: archiveNumber(date), difficulty: 'HARD', givens: archiveGivens })
    }
    if (method === 'POST' && path === '/api/sudoku/archive/runs') {
      const date = String(body?.date)
      if (!inArchive(date)) return mockProblem(404, 'NOT_IN_ARCHIVE', 'That Daily puzzle is not in the archive')
      if (archiveRun && status(archiveRun) === 'PLAYING') archiveRun.abandoned = true
      archiveRun = { ...make(`archive-${++archiveCount}`, 'ARCHIVE', false, 'HARD', archiveGivens), date, puzzleNumber: archiveNumber(date) }
      runs.set(archiveRun.id, archiveRun)
      return mockJson(view(archiveRun), 201)
    }
    if (method === 'GET' && path === '/api/sudoku/daily/history') {
      if (!user) return mockProblem(401, 'UNAUTHORIZED', 'Authentication is required')
      return mockJson(dailyHistory(history))
    }
    if (method === 'POST' && path === '/api/sudoku/daily/runs') {
      if (dailyRun?.scored) return mockProblem(409, 'DAILY_ALREADY_PLAYED', "You have played today's puzzle.")
      dailyRun ??= make('daily-run', 'DAILY', true, 'HARD', givens)
      dailyRun.sessionId = String(body?.sessionId)
      runs.set(dailyRun.id, dailyRun)
      return mockJson(view(dailyRun))
    }
    if (method === 'POST' && path === '/api/sudoku/practice/runs') {
      if (practiceRun) practiceRun.abandoned = status(practiceRun) === 'PLAYING' || practiceRun.abandoned
      practiceRun = make(`practice-${++practiceCount}`, 'PRACTICE', body?.sessionId !== undefined, String(body?.difficulty), PUZZLE)
      practiceRun.sessionId = (body?.sessionId as string) ?? null
      runs.set(practiceRun.id, practiceRun)
      return mockJson(view(practiceRun), 201)
    }
    const notesOf = path.match(/^\/api\/sudoku\/runs\/([^/]+)\/notes$/)
    if (notesOf) {
      if (notesOffline) throw new TypeError('Failed to fetch')
      if (!user) return mockProblem(401, 'UNAUTHORIZED', 'Authentication is required')
      const id = decodeURIComponent(notesOf[1])
      const run = runs.get(id)
      if (!run) return mockProblem(404, 'NOT_FOUND', 'Sudoku run was not found')
      const saved = savedNotes.get(id) ?? { revision: 0, cells: [] }
      if (method === 'GET') return notesHeld ? notesHeld.then(() => mockJson(saved)) : mockJson(saved)
      if (method !== 'PUT') return mockProblem(405, 'METHOD_NOT_ALLOWED', 'Not allowed')
      if (status(run) !== 'PLAYING') return mockProblem(409, 'RUN_OVER', 'This game is over')
      const cells = body?.cells as FakeNotes['cells']
      const valid = Array.isArray(cells) && cells.every((entry) => entry.cell >= 0 && entry.cell <= 80 && entry.digits.length > 0 && entry.digits.every((digit) => digit >= 1 && digit <= 9))
      if (!valid || typeof body?.baseRevision !== 'number') return mockProblem(400, 'VALIDATION_FAILED', 'Request validation failed')
      const canonical = (list: FakeNotes['cells']) => [...list].sort((a, b) => a.cell - b.cell).map((entry) => ({ cell: entry.cell, digits: [...entry.digits].sort() }))
      const baseCells = body.baseCells as FakeNotes['cells'] | undefined
      const otherBase = baseCells !== undefined && JSON.stringify(canonical(baseCells)) !== JSON.stringify(canonical(saved.cells))
      const answer = <T>(response: T) => (savesHeld ? savesHeld.then(() => response) : response)
      if (body.baseRevision !== saved.revision || otherBase) return answer(mockProblem(409, 'NOTES_STALE', 'These notes were changed on another device: load them first'))
      const next = { revision: saved.revision + 1, cells: canonical(cells) }
      savedNotes.set(id, next)
      return answer(mockJson(next))
    }
    const action = path.match(/^\/api\/sudoku\/runs\/([^/]+)\/(session|moves|hints|pause|resume)$/)
    if (method === 'POST' && action) {
      const run = runs.get(decodeURIComponent(action[1]))
      if (!run) return mockProblem(404, 'NOT_FOUND', 'Sudoku run was not found')
      switch (action[2]) {
        case 'session':
          run.sessionId = String(body?.sessionId)
          return mockJson(view(run))
        case 'pause':
          run.paused = true
          return mockJson(view(run))
        case 'resume':
          run.paused = false
          return mockJson(view(run))
        case 'moves': {
          if (status(run) !== 'PLAYING') return mockProblem(409, 'RUN_OVER', 'This game is over')
          run.paused = false
          for (const move of (body?.moves as { cell: number; digit: number }[]) ?? []) {
            if (run.givens[move.cell] !== '0' || run.revealed.includes(move.cell)) return mockProblem(409, 'CELL_LOCKED', 'Clues cannot be changed')
            if (move.digit !== 0 && run.values[move.cell] !== move.digit) {
              const wrong = run.ranked ? String(move.digit) !== SOLVED[move.cell] : false
              if (wrong) run.mistakes++
            }
            run.values[move.cell] = move.digit
          }
          return mockJson(view(run))
        }
        case 'hints': {
          if (run.hints.length >= 3) return mockProblem(409, 'HINT_UNAVAILABLE', 'No hints left in this game')
          const type = String(body?.type)
          const empty = run.values.findIndex((value, cell) => value !== Number(SOLVED[cell]))
          const cell = typeof body?.cell === 'number' ? body.cell : empty
          if (run.givens[cell] !== '0') return mockProblem(409, 'HINT_UNAVAILABLE', 'That cell is a clue')
          run.hints.push({ type, cell })
          if (type === 'REVEAL') {
            run.values[cell] = Number(SOLVED[cell])
            run.revealed.push(cell)
          }
          const digit = type === 'FIND' ? 0 : Number(SOLVED[cell])
          return mockJson({
            run: view(run),
            hint: {
              type,
              cell,
              digit,
              technique: type === 'REVEAL' ? null : 'HIDDEN_SINGLE',
              explanation: type === 'EXPLAIN' ? ['Pointing: 7 comes out of r1c9.', `Hidden single: in box 1, ${digit} fits only in r1c3.`] : [`r1c${cell + 1} can be solved now.`],
              highlight: [cell, 8],
              eliminations: type === 'EXPLAIN' ? ['8:7'] : [],
            },
          })
        }
      }
    }
    return mockProblem(404, 'NOT_FOUND', `No Sudoku mock for ${method} ${path}`)
  }

  return {
    handler,
    calls,
    run: (id: string) => runs.get(id),
    get dailyRun() {
      return dailyRun
    },
    get practiceRun() {
      return practiceRun
    },
    get archiveRun() {
      return archiveRun
    },
    /** A run's notes as the server has them. */
    notes: (id: string): FakeNotes => savedNotes.get(id) ?? { revision: 0, cells: [] },
    /** Another device saves these notes for a run. */
    saveElsewhere(id: string, cells: FakeNotes['cells']) {
      savedNotes.set(id, { revision: (savedNotes.get(id)?.revision ?? 0) + 1, cells })
    },
    /** Notes requests the browser sent, in order. */
    noteCalls: () => calls.filter((call) => call.path.endsWith('/notes')),
    /** Lets held notes reads answer, with the notes as they were asked for. */
    releaseNotes: () => releaseNotes(),
    /** From now on, notes saves are done at once but answered only on `releaseSaves()`: a save still on its way. */
    holdSaves() {
      savesHeld = new Promise<void>((resolve) => (releaseSaves = resolve))
    },
    /** Answers the held saves, and holds no more. */
    releaseSaves() {
      savesHeld = null
      releaseSaves()
    },
    /** The page that sent the held saves is gone: their answers never reach it. Later saves are answered. */
    dropSaves() {
      savesHeld = null
    },
    set notesOffline(offline: boolean) {
      notesOffline = offline
    },
    /** The moves the browser sent, in order, flattened. */
    moves: () => calls.filter((call) => call.path.endsWith('/moves')).flatMap((call) => (call.body?.moves as { cell: number; digit: number }[]) ?? []),
  }
}
