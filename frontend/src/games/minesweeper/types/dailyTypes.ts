/**
 * The Daily Board as the server sends it (`/api/minesweeper/daily`, `DailyBoardViews` on the
 * backend), field for field. The server plays the board: these are pictures of what it decided, and
 * none of them holds a covered cell's contents, a mine that has not gone off, or the day's seed.
 */

/** What became of an attempt: still being played, cleared, a mine set off, or out of time. */
export type DailyStatus = 'PLAYING' | 'WON' | 'LOST' | 'EXPIRED'

/**
 * What a win was paid, by the server, once: XP, and coins unless the day's paid games were used up
 * before it (then `coins` is 0).
 */
export interface DailyReward {
  xp: number
  coins: number
}

/**
 * An attempt as its player sees it.
 *
 * `cells` holds one character per cell, row by row (cell `r × columns + c`): `H` covered, `F`
 * flagged, `0`–`8` uncovered with that many mines around, `X` the mine that went off. A new attempt
 * already shows the day's opening (`startCell` and the empty area around it) uncovered.
 */
export interface DailyAttempt {
  id: string
  /** The UTC date the attempt belongs to (`YYYY-MM-DD`): the day it was started. */
  date: string
  boardNumber: number
  rows: number
  columns: number
  mines: number
  startCell: number
  status: DailyStatus
  cells: string
  /** The player's reveals that uncovered something; the opening is not one. */
  moves: number
  revealedCells: number
  flags: number
  minesLeft: number
  /** When the server created the attempt: its clock starts here. */
  startedAt: string
  /** When the attempt runs out of time. */
  deadline: string
  /** When it ended; `null` while it is being played. */
  finishedAt: string | null
  /** The server's time from start to the reveal that won or lost it; `null` while playing and when expired. */
  elapsedMs: number | null
  /** What the win earned; `null` for an attempt that has not been won. */
  reward: DailyReward | null
  /** The server's clock as it answered. */
  serverTime: string
}

/** `GET /api/minesweeper/daily`: today's board, and the caller's attempt at it. */
export interface DailyToday {
  date: string
  boardNumber: number
  rows: number
  columns: number
  mines: number
  startCell: number
  timeLimitMs: number
  /** The coming 00:00 UTC, when the next board comes out. */
  resetsAt: string
  serverTime: string
  /** The caller's attempt at today's board, or `null` before they start one. */
  attempt: DailyAttempt | null
}

export interface DailyPlayer {
  username: string
  displayName: string
  avatar: string
}

export interface DailyLeaderboardEntry {
  /** 1 for the fastest; no two share one (equal times: whoever finished first). */
  rank: number
  player: DailyPlayer
  elapsedMs: number
  finishedAt: string
  you: boolean
}

/** `GET /api/minesweeper/daily/leaderboard`: one page of a day's wins, fastest first. */
export interface DailyLeaderboard {
  date: string
  boardNumber: number
  entries: DailyLeaderboardEntry[]
  page: number
  size: number
  totalEntries: number
  totalPages: number
  /** The caller's rank that day, or `null` without a win. */
  myRank: number | null
  myElapsedMs: number | null
}
