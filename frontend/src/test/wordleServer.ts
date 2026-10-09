import type { MockHandler } from './mockApi'
import { mockJson, mockProblem } from './mockApi'

/**
 * A small stand-in for Word Guess's server, for tests: one hidden word, a word list, daily and
 * practice runs, hints and the admin AI. Its judging is the textbook rule (exact matches first, then
 * present letters while the word has copies left); the real one is the server's.
 */

type Result = 'CORRECT' | 'PRESENT' | 'ABSENT'

export function judge(target: string, guess: string): Result[] {
  const results: Result[] = Array(5).fill('ABSENT')
  const left: Record<string, number> = {}
  for (let i = 0; i < 5; i++) {
    if (guess[i] === target[i]) results[i] = 'CORRECT'
    else left[target[i]] = (left[target[i]] ?? 0) + 1
  }
  for (let i = 0; i < 5; i++) {
    if (results[i] !== 'CORRECT' && (left[guess[i]] ?? 0) > 0) {
      results[i] = 'PRESENT'
      left[guess[i]]--
    }
  }
  return results
}

interface FakeRun {
  id: string
  mode: 'DAILY' | 'PRACTICE'
  target: string
  guesses: string[]
  hints: { type: string; position?: number; letter?: string; letters?: string[] }[]
  sessionId: string | null
  scored: boolean
}

export interface WordleServerOptions {
  target?: string
  practiceTarget?: string
  words?: string[]
  /** Today's daily run, already played this far. */
  daily?: { guesses?: string[]; scored?: boolean } | null
  stats?: Record<string, unknown>
}

const PERCENTS = [100, 90, 75, 60]

export function wordleServer({
  target = 'APPLE',
  practiceTarget = 'SLOTH',
  words = ['APPLE', 'ALLEY', 'CRANE', 'SLOTH', 'BUILT', 'GHOST', 'MOUND', 'PIXEL', 'LLAMA', 'PAPER'],
  daily = null,
  stats = {},
}: WordleServerOptions = {}) {
  const runs = new Map<string, FakeRun>()
  const calls: { path: string; body: Record<string, unknown> | undefined }[] = []
  let dailyRun: FakeRun | null = daily
    ? { id: 'daily-run', mode: 'DAILY', target, guesses: daily.guesses ?? [], hints: [], sessionId: 'old-session', scored: daily.scored ?? false }
    : null
  if (dailyRun) runs.set(dailyRun.id, dailyRun)
  let practiceCount = 0

  const status = (run: FakeRun) =>
    run.guesses.at(-1) === run.target ? 'SOLVED' : run.guesses.length >= 6 ? 'FAILED' : 'PLAYING'

  const view = (run: FakeRun) => {
    const state = status(run)
    const solved = state === 'SOLVED'
    const percent = PERCENTS[run.hints.length]
    const score = solved ? Math.floor((100 * (7 - run.guesses.length) * percent) / 100) : 0
    return {
      id: run.id,
      mode: run.mode,
      puzzleNumber: run.mode === 'DAILY' ? 281 : null,
      date: run.mode === 'DAILY' ? '2026-10-08' : null,
      status: state,
      wordLength: 5,
      maxGuesses: 6,
      guesses: run.guesses.map((word) => ({ word, feedback: judge(run.target, word) })),
      hints: run.hints.map((hint) => ({
        type: hint.type,
        position: hint.position ?? null,
        letter: hint.letter ?? null,
        present: hint.type === 'CHECK_LETTER' ? run.target.includes(hint.letter ?? '') : null,
        letters: hint.letters ?? null,
      })),
      hintsLeft: 3 - run.hints.length,
      availableHints: state === 'PLAYING' ? ['REVEAL_LETTER', 'CHECK_LETTER', 'ELIMINATE_LETTERS'].filter((type) => !run.hints.some((hint) => hint.type === type)) : [],
      answer: state === 'PLAYING' ? null : run.target,
      result:
        state === 'PLAYING'
          ? null
          : {
              score,
              hintPercent: percent,
              details: {
                solved: solved ? 1 : 0,
                guesses: run.guesses.length,
                hints: run.hints.length,
                speed: solved ? 7 - run.guesses.length : 0,
                cleanSolve: solved && run.hints.length === 0 ? 1 : 0,
                oneHintSolve: solved && run.hints.length === 1 ? 1 : 0,
                streak: solved && run.mode === 'DAILY' ? 1 : 0,
              },
            },
      scored: run.scored,
    }
  }

  const solution = (strategy: string) => {
    const guesses = ['CRANE', 'ALLEY', target]
    return {
      puzzleNumber: 281,
      date: '2026-10-08',
      strategy,
      solved: true,
      guesses: guesses.length,
      score: 100 * (7 - guesses.length),
      answer: target,
      steps: guesses.map((guess, index) => ({
        guess,
        feedback: judge(target, guess),
        candidatesBefore: [662, 40, 2][index],
        candidatesAfter: [40, 2, 1][index],
        reason: strategy === 'SPEED_SOLVER' ? 'most common letters among 662 words' : '5.91 bits expected',
        couldWin: true,
        remaining: index === 2 ? [target] : [],
      })),
    }
  }

  const handler: MockHandler = ({ path, method, body, user }) => {
    if (!path.startsWith('/api/wordle/') && !path.startsWith('/api/ai/wordle/')) return undefined
    calls.push({ path, body })

    if (path.startsWith('/api/ai/wordle/')) {
      if (!user) return mockProblem(401, 'UNAUTHORIZED', 'Authentication is required')
      if (user.role !== 'ADMIN') return mockProblem(403, 'FORBIDDEN', 'You are not allowed to do this')
      if (path === '/api/ai/wordle/solve') return mockJson(solution(String(body?.strategy)))
      return mockJson({ strategy: 'BALANCED', games: 662, solved: 662, failed: 0, averageGuesses: 3.61, distribution: [0, 20, 250, 300, 80, 12], millis: 1500 })
    }

    if (method === 'GET' && path === '/api/wordle/daily') {
      return mockJson({
        puzzleNumber: 281,
        date: '2026-10-08',
        nextPuzzleAt: new Date(Date.now() + 3 * 60 * 60_000).toISOString(),
        wordLength: 5,
        maxGuesses: 6,
        maxHints: 3,
        hintPercents: PERCENTS,
        run: dailyRun ? view(dailyRun) : null,
      })
    }
    if (method === 'GET' && path === '/api/wordle/stats') {
      return mockJson({ played: 4, solved: 3, winRate: 75, currentStreak: 2, bestStreak: 3, averageGuesses: 3.7, distribution: [0, 1, 1, 1, 0, 0], lastPlayed: '2026-10-07', ...stats })
    }
    if (method === 'POST' && path === '/api/wordle/daily/runs') {
      const sessionId = String(body?.sessionId)
      if (dailyRun?.scored) return mockProblem(409, 'DAILY_ALREADY_PLAYED', 'You have played today\'s puzzle.')
      dailyRun ??= { id: 'daily-run', mode: 'DAILY', target, guesses: [], hints: [], sessionId, scored: false }
      dailyRun.sessionId = sessionId
      runs.set(dailyRun.id, dailyRun)
      return mockJson(view(dailyRun))
    }
    if (method === 'POST' && path === '/api/wordle/practice/runs') {
      const run: FakeRun = { id: `practice-${++practiceCount}`, mode: 'PRACTICE', target: practiceTarget, guesses: [], hints: [], sessionId: null, scored: false }
      runs.set(run.id, run)
      return mockJson(view(run), 201)
    }
    const move = path.match(/^\/api\/wordle\/runs\/([^/]+)\/(guesses|hints)$/)
    if (method === 'POST' && move) {
      const run = runs.get(decodeURIComponent(move[1]))
      if (!run) return mockProblem(404, 'NOT_FOUND', 'Word Guess run was not found')
      if (status(run) !== 'PLAYING') return mockProblem(409, 'RUN_OVER', 'This game is over')
      if (move[2] === 'guesses') {
        const word = String(body?.word).toUpperCase()
        if (!words.includes(word)) return mockProblem(422, 'WORD_NOT_IN_LIST', 'That word is not in the word list')
        run.guesses.push(word)
        return mockJson(view(run))
      }
      const type = String(body?.type)
      if (run.hints.some((hint) => hint.type === type)) return mockProblem(409, 'HINT_UNAVAILABLE', 'That hint has been used in this game')
      if (type === 'REVEAL_LETTER') run.hints.push({ type, position: 1, letter: run.target[1] })
      if (type === 'CHECK_LETTER') run.hints.push({ type, letter: String(body?.letter) })
      if (type === 'ELIMINATE_LETTERS') run.hints.push({ type, letters: ['Q', 'X', 'Z'] })
      return mockJson(view(run))
    }
    return mockProblem(404, 'NOT_FOUND', `No Word Guess mock for ${method} ${path}`)
  }

  return {
    handler,
    calls,
    /** The run of a daily or practice game. */
    run: (id: string) => runs.get(id),
    get dailyRun() {
      return dailyRun
    },
    reset() {
      dailyRun = null
    },
  }
}
