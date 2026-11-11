import type { MockHandler } from './mockApi'
import { mockJson, mockProblem } from './mockApi'

/**
 * A small stand-in for Minesweeper's Daily Board server, for tests. It keeps the day's mines and
 * answers with the board as a player may see it, field for field like the backend's views. The real
 * layout comes from the server's secret; this one is fixed, so a test knows what each cell holds:
 *
 * - row 0 and row 1, columns 0–7: mines (24), and all of row 7: mines (16);
 * - the opening is the bottom-right cell (255), which uncovers rows 8–15 (128 cells);
 * - revealing cell 96 (row 6, column 0) uncovers just that cell, a 2;
 * - revealing cell 64 (row 4, column 0) uncovers everything else, and clears the board;
 * - revealing cell 0 sets off a mine.
 */

export const ROWS = 16
export const COLUMNS = 16
export const MINES = 40
export const START_CELL = 255
export const SAFE_CELLS = ROWS * COLUMNS - MINES
/** A cell uncovered alone: a 2, next to two of row 7's mines. */
export const LONE_TWO = 96
/** A cell whose reveal clears the rest of the board. */
export const WINNING_CELL = 64
/** A covered mine. */
export const A_MINE = 0
export const TIME_LIMIT_MS = 999_999
/** The day the tests are played on, and its board's number. */
export const DAY = '2026-11-07'
export const BOARD_NUMBER = 7
const FIRST_DAY = Date.UTC(2026, 10, 1)
const DAY_MS = 24 * 60 * 60_000

const MINE_CELLS = new Set([
  ...Array.from({ length: 16 }, (_, column) => column),
  ...Array.from({ length: 8 }, (_, column) => 16 + column),
  ...Array.from({ length: 16 }, (_, column) => 7 * 16 + column),
])

function neighbours(cell: number): number[] {
  const row = Math.floor(cell / COLUMNS)
  const column = cell % COLUMNS
  const around: number[] = []
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      const r = row + dr
      const c = column + dc
      if ((dr !== 0 || dc !== 0) && r >= 0 && r < ROWS && c >= 0 && c < COLUMNS) around.push(r * COLUMNS + c)
    }
  }
  return around
}

const adjacent = (cell: number) => neighbours(cell).filter((next) => MINE_CELLS.has(next)).length

type Status = 'PLAYING' | 'WON' | 'LOST' | 'EXPIRED'

interface FakeAttempt {
  id: string
  username: string
  date: string
  revealed: Set<number>
  flagged: Set<number>
  exploded: number | null
  moves: number
  status: Status
  startedAt: number
  finishedAt: number | null
  reward: { xp: number; coins: number } | null
}

export interface LeaderboardRow {
  username: string
  displayName?: string
  elapsedMs: number
}

/** A failure to answer one request with, instead of the server's answer. */
export type Failure = 'network' | number

export interface DailyServerOptions {
  /** The server's clock, in milliseconds; by default this device's, at 12:00 UTC on the test day. */
  clock?: () => number
  /** Other players' wins, per date. */
  leaderboard?: Record<string, LeaderboardRow[]>
  /** The coins a win pays: 5, or 0 once the day's paid games were used up. */
  winCoins?: number
}

const iso = (ms: number) => new Date(ms).toISOString()
const dayOf = (ms: number) => iso(ms).slice(0, 10)
const boardNumberOf = (date: string) => Math.round((Date.parse(`${date}T00:00:00Z`) - FIRST_DAY) / DAY_MS) + 1

/** A clock that runs with this device's from the given UTC moment. */
export function clockFrom(start: string): () => number {
  const offset = Date.parse(start) - Date.now()
  return () => Date.now() + offset
}

export function minesweeperDailyServer({
  clock = clockFrom(`${DAY}T12:00:00Z`),
  leaderboard = {},
  winCoins = 5,
}: DailyServerOptions = {}) {
  const attempts = new Map<string, FakeAttempt>()
  const requests: { method: string; path: string; body: Record<string, unknown> | undefined; query: string }[] = []
  const failures: { match: RegExp; failure: Failure }[] = []
  const holds: { match: RegExp; release: Promise<void> }[] = []
  let nextId = 1

  const flood = (attempt: FakeAttempt, from: number) => {
    const queue = [from]
    while (queue.length > 0) {
      const cell = queue.pop() as number
      if (attempt.revealed.has(cell) || MINE_CELLS.has(cell)) continue
      attempt.revealed.add(cell)
      attempt.flagged.delete(cell)
      if (adjacent(cell) === 0) queue.push(...neighbours(cell))
    }
  }

  const deadlineOf = (attempt: FakeAttempt) => attempt.startedAt + TIME_LIMIT_MS
  const expireIfDue = (attempt: FakeAttempt) => {
    if (attempt.status === 'PLAYING' && clock() >= deadlineOf(attempt)) {
      attempt.status = 'EXPIRED'
      attempt.finishedAt = deadlineOf(attempt)
    }
  }

  const view = (attempt: FakeAttempt) => {
    expireIfDue(attempt)
    const cells = Array.from({ length: ROWS * COLUMNS }, (_, cell) => {
      if (cell === attempt.exploded) return 'X'
      if (attempt.revealed.has(cell)) return String(adjacent(cell))
      if (attempt.flagged.has(cell)) return 'F'
      return 'H'
    }).join('')
    const timed = attempt.status === 'WON' || attempt.status === 'LOST'
    return {
      id: attempt.id,
      date: attempt.date,
      boardNumber: boardNumberOf(attempt.date),
      rows: ROWS,
      columns: COLUMNS,
      mines: MINES,
      startCell: START_CELL,
      status: attempt.status,
      cells,
      moves: attempt.moves,
      revealedCells: attempt.revealed.size,
      flags: attempt.flagged.size,
      minesLeft: MINES - attempt.flagged.size,
      startedAt: iso(attempt.startedAt),
      deadline: iso(deadlineOf(attempt)),
      finishedAt: attempt.finishedAt === null ? null : iso(attempt.finishedAt),
      elapsedMs: timed && attempt.finishedAt !== null ? attempt.finishedAt - attempt.startedAt : null,
      reward: attempt.reward,
      serverTime: iso(clock()),
    }
  }

  const find = (username: string, date: string) =>
    [...attempts.values()].find((attempt) => attempt.username === username && attempt.date === date)

  /** Starts an attempt for that player, as `POST /attempts` would, at the server's clock now. */
  const begin = (username = 'pixel', at = clock()) => {
    const date = dayOf(at)
    const existing = find(username, date)
    if (existing) return existing
    const attempt: FakeAttempt = {
      id: `attempt-${nextId++}`,
      username,
      date,
      revealed: new Set(),
      flagged: new Set(),
      exploded: null,
      moves: 0,
      status: 'PLAYING',
      startedAt: at,
      finishedAt: null,
      reward: null,
    }
    flood(attempt, START_CELL)
    attempts.set(attempt.id, attempt)
    return attempt
  }

  const reveal = (attempt: FakeAttempt, cell: number) => {
    if (attempt.revealed.has(cell) || attempt.flagged.has(cell)) return
    attempt.moves++
    if (MINE_CELLS.has(cell)) {
      attempt.exploded = cell
      attempt.status = 'LOST'
      attempt.finishedAt = clock()
      return
    }
    flood(attempt, cell)
    if (attempt.revealed.size === SAFE_CELLS) {
      attempt.status = 'WON'
      attempt.finishedAt = clock()
      attempt.reward = { xp: 10, coins: winCoins }
    }
  }

  const board = (date: string, username: string | null, page: number, size: number) => {
    const wins = [
      ...(leaderboard[date] ?? []).map((row) => ({ ...row, displayName: row.displayName ?? row.username })),
      ...[...attempts.values()]
        .filter((attempt) => attempt.date === date && attempt.status === 'WON')
        .map((attempt) => ({
          username: attempt.username,
          displayName: attempt.username,
          elapsedMs: (attempt.finishedAt as number) - attempt.startedAt,
        })),
    ].sort((a, b) => a.elapsedMs - b.elapsedMs)
    const ranked = wins.map((row, index) => ({
      rank: index + 1,
      player: { username: row.username, displayName: row.displayName, avatar: 'ROBOT' },
      elapsedMs: row.elapsedMs,
      finishedAt: `${date}T12:00:00Z`,
      you: row.username === username,
    }))
    const mine = ranked.find((entry) => entry.you)
    return {
      date,
      boardNumber: boardNumberOf(date),
      entries: ranked.slice(page * size, page * size + size),
      page,
      size,
      totalEntries: ranked.length,
      totalPages: Math.ceil(ranked.length / size),
      myRank: mine?.rank ?? null,
      myElapsedMs: mine?.elapsedMs ?? null,
    }
  }

  const answer: MockHandler = ({ path, method, url, body, user }) => {
    if (!path.startsWith('/api/minesweeper/daily')) return undefined
    const route = `${method} ${path}`

    const failure = failures.findIndex(({ match }) => match.test(route))
    if (failure >= 0) {
      const [{ failure: kind }] = failures.splice(failure, 1)
      if (kind === 'network') return Promise.reject(new TypeError('Failed to fetch'))
      return mockProblem(kind, kind === 409 ? 'ATTEMPT_OVER' : 'SERVER_ERROR', 'Refused by the test')
    }
    if (!user) return mockProblem(401, 'UNAUTHORIZED', 'Authentication is required')

    if (method === 'GET' && path === '/api/minesweeper/daily') {
      const now = clock()
      const date = dayOf(now)
      const attempt = find(user.username, date)
      return mockJson({
        date,
        boardNumber: boardNumberOf(date),
        rows: ROWS,
        columns: COLUMNS,
        mines: MINES,
        startCell: START_CELL,
        timeLimitMs: TIME_LIMIT_MS,
        resetsAt: iso(Date.parse(`${date}T00:00:00Z`) + DAY_MS),
        serverTime: iso(now),
        attempt: attempt ? view(attempt) : null,
      })
    }
    if (method === 'POST' && path === '/api/minesweeper/daily/attempts') {
      return mockJson(view(begin(user.username)), 201)
    }
    if (method === 'GET' && path === '/api/minesweeper/daily/leaderboard') {
      const date = url.searchParams.get('date') ?? dayOf(clock())
      if (date > dayOf(clock())) return mockProblem(404, 'NOT_FOUND', 'No board that day')
      return mockJson(board(date, user.username, Number(url.searchParams.get('page') ?? 0), Number(url.searchParams.get('size') ?? 20)))
    }

    const move = /^\/api\/minesweeper\/daily\/attempts\/([^/]+)(?:\/(reveal|flag))?$/.exec(path)
    const attempt = move ? attempts.get(decodeURIComponent(move[1])) : undefined
    if (!move || !attempt || attempt.username !== user.username) return mockProblem(404, 'NOT_FOUND', 'No such attempt')
    if (method === 'GET' && !move[2]) return mockJson(view(attempt))
    if (method !== 'POST' || !move[2]) return undefined

    expireIfDue(attempt)
    if (attempt.status !== 'PLAYING') return mockProblem(409, 'ATTEMPT_OVER', 'This attempt is over')
    const cell = Number(body?.cell)
    if (!Number.isInteger(cell) || cell < 0 || cell >= ROWS * COLUMNS) return mockProblem(400, 'VALIDATION_FAILED', 'No such cell')
    if (move[2] === 'reveal') {
      reveal(attempt, cell)
    } else if (!attempt.revealed.has(cell)) {
      if (body?.flagged === true) attempt.flagged.add(cell)
      else attempt.flagged.delete(cell)
    }
    return mockJson(view(attempt))
  }

  const handler: MockHandler = (request) => {
    if (!request.path.startsWith('/api/minesweeper/daily')) return undefined
    const route = `${request.method} ${request.path}`
    requests.push({ method: request.method, path: request.path, body: request.body, query: request.url.search })
    const hold = holds.findIndex(({ match }) => match.test(route))
    if (hold >= 0) {
      const [{ release }] = holds.splice(hold, 1)
      return release.then(() => answer(request) as Response | Promise<Response>)
    }
    return answer(request)
  }

  return {
    handler,
    requests,
    /** The requests to these routes (`METHOD /path`), in order. */
    sent: (match: RegExp) => requests.filter(({ method, path }) => match.test(`${method} ${path}`)),
    begin,
    /** Plays a move on the server directly, as another tab would. */
    reveal: (attempt: FakeAttempt, cell: number) => reveal(attempt, cell),
    /** Ends the attempt by its time limit. */
    expire: (attempt: FakeAttempt) => {
      attempt.startedAt = clock() - TIME_LIMIT_MS
    },
    /** Fails the next request to a matching route (`METHOD /path`) this way. */
    failNext: (match: RegExp, failure: Failure) => failures.push({ match, failure }),
    /** Holds the next request to a matching route until the returned function is called. */
    hold: (match: RegExp) => {
      let release = () => {}
      holds.push({ match, release: new Promise<void>((resolve) => (release = resolve)) })
      return () => release()
    },
  }
}
