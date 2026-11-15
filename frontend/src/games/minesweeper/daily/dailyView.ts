import type { Cell, MinesweeperState } from '../types/minesweeperTypes'
import type { DailyAttempt, DailyStatus } from '../types/dailyTypes'

/**
 * The Daily Board's screen, worked out from what the server sent and nothing else. No engine runs
 * here: the board drawn is the server's picture of the attempt, and the clock is the server's, read
 * through the difference between its clock and this device's.
 */

/** The Daily Board's size before the server has said (it always sends its own). */
export const DAILY_SHAPE = { rows: 16, columns: 16, mines: 40 } as const

const cellOf = (shown: string): Cell => {
  if (shown === 'X') return { mine: true, adjacent: 0, revealed: true, flagged: false }
  if (shown === 'F') return { mine: false, adjacent: 0, revealed: false, flagged: true }
  if (shown >= '0' && shown <= '8') return { mine: false, adjacent: Number(shown), revealed: true, flagged: false }
  // `H`, and anything the server might add later: covered, its contents unknown here.
  return { mine: false, adjacent: 0, revealed: false, flagged: false }
}

/** How the board component shows an attempt's status: a finished attempt takes no more input. */
const boardStatus: Record<DailyStatus, MinesweeperState['status']> = {
  PLAYING: 'playing',
  WON: 'won',
  // An attempt out of time is over like a lost one, without a mine shown.
  LOST: 'lost',
  EXPIRED: 'lost',
}

/**
 * The attempt as the shared board component draws it. Only the mine that went off is a mine here:
 * the server never says where the others are, so a covered cell is just covered.
 */
export function toBoardState(attempt: DailyAttempt): MinesweeperState {
  const cells = Array.from({ length: attempt.rows * attempt.columns }, (_, index) => cellOf(attempt.cells[index] ?? 'H'))
  const exploded = attempt.cells.indexOf('X')
  return {
    rows: attempt.rows,
    columns: attempt.columns,
    mines: attempt.mines,
    cells,
    status: boardStatus[attempt.status],
    seed: 0,
    startSeed: 0,
    firstCell: attempt.startCell,
    revealed: attempt.revealedCells,
    flags: attempt.flags,
    moves: attempt.moves,
    exploded: exploded >= 0 ? exploded : null,
  }
}

/** A covered board of the day's size, shown until an attempt starts. */
export function coveredBoard(shape: { rows: number; columns: number; mines: number } = DAILY_SHAPE): MinesweeperState {
  return {
    ...shape,
    cells: Array.from({ length: shape.rows * shape.columns }, () => cellOf('H')),
    status: 'ready',
    seed: 0,
    startSeed: 0,
    firstCell: null,
    revealed: 0,
    flags: 0,
    moves: 0,
    exploded: null,
  }
}

/** Whether a reveal there could change anything: only a covered cell can be uncovered. */
export const canReveal = (attempt: DailyAttempt, cell: number) => attempt.status === 'PLAYING' && attempt.cells[cell] === 'H'

/** Whether a flag can go on or come off there: a covered or flagged cell, flags short of the mines. */
export function flagChange(attempt: DailyAttempt, cell: number): boolean | null {
  if (attempt.status !== 'PLAYING') return null
  const shown = attempt.cells[cell]
  if (shown === 'F') return false
  if (shown === 'H' && attempt.flags < attempt.mines) return true
  return null
}

/**
 * How far the server's clock is ahead of this device's, in milliseconds: its `serverTime` against
 * the moment the answer arrived. The answer's trip back makes it a little low, which is fine for a
 * clock shown to the player; the time that counts is the server's own.
 */
export const clockOffset = (serverTime: string, receivedAt: number) => Date.parse(serverTime) - receivedAt

/** The server's clock now, as this device can tell it. */
export const serverNow = (offset: number, deviceNow: number) => deviceNow + offset

/**
 * The time shown for an attempt at that server moment: the server's own once it has finished, and
 * while it is played an estimate from its start, never past its limit.
 */
export function shownElapsed(attempt: DailyAttempt, now: number, limitMs: number): number {
  if (attempt.elapsedMs !== null) return attempt.elapsedMs
  if (attempt.status === 'EXPIRED') return limitMs
  if (attempt.status !== 'PLAYING') return 0
  return Math.min(limitMs, Math.max(0, now - Date.parse(attempt.startedAt)))
}

/** A countdown as `h:mm:ss`, in whole seconds left (so a day starts at 23:59:59). */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor(total / 60) % 60
  const seconds = total % 60
  return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

/** A UTC date (`YYYY-MM-DD`) as people read it, e.g. "Sat 7 Nov 2026 (UTC)". */
export function formatUtcDate(date: string): string {
  const day = new Date(`${date}T00:00:00Z`)
  if (Number.isNaN(day.getTime())) return date
  const text = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(day)
  return `${text.replace(',', '')} (UTC)`
}
