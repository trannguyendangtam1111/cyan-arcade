import { randomInt } from '@/games/shared/random'
import type { Cell, MinesweeperAction, MinesweeperConfig, MinesweeperState } from '../types/minesweeperTypes'

/**
 * Minesweeper rules as pure functions. `updateMinesweeper(state, action)` always returns the same
 * result for the same input: the mines are laid from the seed in the state, at the first reveal.
 *
 * The scoring and the board are mirrored on the server (`gamerules.MinesweeperRunRules`), which
 * checks every finished run against them.
 */

export type { Cell, MinesweeperAction, MinesweeperConfig, MinesweeperState } from '../types/minesweeperTypes'

/** The one board the arcade plays: 9 × 9 with 10 mines. */
export const BEGINNER: MinesweeperConfig = { rows: 9, columns: 9, mines: 10 }

export const POINTS_PER_CELL = 10
export const WIN_BONUS = 500
/** A cleared board earns a point for every second under this. */
export const TIME_BONUS_SECONDS = 600

const emptyCell = (): Cell => ({ mine: false, adjacent: 0, revealed: false, flagged: false })

export function createMinesweeper(seed: number, config: MinesweeperConfig = BEGINNER): MinesweeperState {
  return {
    ...config,
    cells: Array.from({ length: config.rows * config.columns }, emptyCell),
    status: 'ready',
    seed,
    revealed: 0,
    flags: 0,
    moves: 0,
    exploded: null,
  }
}

/** The indexes of a cell's neighbours, up to eight. */
export function neighbours(state: MinesweeperConfig, index: number): number[] {
  const row = Math.floor(index / state.columns)
  const column = index % state.columns
  const result: number[] = []
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      const r = row + dr
      const c = column + dc
      if ((dr !== 0 || dc !== 0) && r >= 0 && r < state.rows && c >= 0 && c < state.columns) {
        result.push(r * state.columns + c)
      }
    }
  }
  return result
}

/** Safe cells on the board: the ones a player must uncover to win. */
export function safeCells(state: MinesweeperConfig): number {
  return state.rows * state.columns - state.mines
}

/** Mines not yet accounted for by a flag, as the mine counter shows it. */
export function minesLeft(state: MinesweeperState): number {
  return state.mines - state.flags
}

/**
 * Lays the mines, keeping the first revealed cell and its neighbours clear so the game always
 * opens with room to think. Picks are a seeded partial shuffle of the allowed cells.
 */
export function layMines(state: MinesweeperState, firstIndex: number): MinesweeperState {
  const keepClear = new Set([firstIndex, ...neighbours(state, firstIndex)])
  // On a board too small to keep the whole neighbourhood clear, only the first cell is spared.
  const allowed = Array.from({ length: state.cells.length }, (_, index) => index).filter((index) =>
    state.cells.length - keepClear.size >= state.mines ? !keepClear.has(index) : index !== firstIndex,
  )
  let seed = state.seed
  for (let pick = 0; pick < state.mines; pick++) {
    const draw = randomInt(seed, allowed.length - pick)
    seed = draw.seed
    const chosen = pick + draw.value
    ;[allowed[pick], allowed[chosen]] = [allowed[chosen], allowed[pick]]
  }
  const mines = new Set(allowed.slice(0, state.mines))
  const cells = state.cells.map((cell, index) => ({
    ...cell,
    mine: mines.has(index),
    adjacent: neighbours(state, index).filter((other) => mines.has(other)).length,
  }))
  return { ...state, cells, seed, status: 'playing' }
}

/**
 * Uncovers a cell. A mine ends the game; an empty cell (no mines around it) uncovers its
 * neighbours too, as far as the empty area goes. Revealing a flagged or uncovered cell, or after
 * the game is over, does nothing.
 */
export function reveal(state: MinesweeperState, index: number): MinesweeperState {
  if (state.status === 'won' || state.status === 'lost') return state
  const target = state.cells[index]
  if (!target || target.revealed || target.flagged) return state

  const current = state.status === 'ready' ? layMines(state, index) : state
  const cells = current.cells.slice()

  if (cells[index].mine) {
    cells[index] = { ...cells[index], revealed: true }
    return { ...current, cells, status: 'lost', exploded: index, moves: current.moves + 1 }
  }

  let uncovered = 0
  const queue = [index]
  while (queue.length > 0) {
    const next = queue.pop() as number
    const cell = cells[next]
    if (cell.revealed || cell.flagged || cell.mine) continue
    cells[next] = { ...cell, revealed: true }
    uncovered++
    if (cell.adjacent === 0) queue.push(...neighbours(current, next))
  }

  const revealed = current.revealed + uncovered
  return {
    ...current,
    cells,
    revealed,
    moves: current.moves + 1,
    status: revealed === safeCells(current) ? 'won' : 'playing',
  }
}

/**
 * Puts a flag on a covered cell, or takes it off. Only during a game, and never more flags than
 * mines: the counter cannot go below zero.
 */
export function toggleFlag(state: MinesweeperState, index: number): MinesweeperState {
  if (state.status !== 'playing') return state
  const cell = state.cells[index]
  if (!cell || cell.revealed) return state
  if (!cell.flagged && state.flags >= state.mines) return state
  const cells = state.cells.slice()
  cells[index] = { ...cell, flagged: !cell.flagged }
  return { ...state, cells, flags: state.flags + (cell.flagged ? -1 : 1) }
}

export function updateMinesweeper(state: MinesweeperState, action: MinesweeperAction): MinesweeperState {
  switch (action.type) {
    case 'REVEAL':
      return reveal(state, action.index)
    case 'FLAG':
      return toggleFlag(state, action.index)
  }
}

/**
 * The run's score: 10 a safe cell uncovered, and for a cleared board 500 more plus a point for
 * every second under ten minutes. Flags never score.
 * @param seconds whole seconds the game took, by the player's clock
 */
export function minesweeperScore(state: MinesweeperState, seconds: number): number {
  const cells = state.revealed * POINTS_PER_CELL
  return state.status === 'won' ? cells + WIN_BONUS + Math.max(0, TIME_BONUS_SECONDS - seconds) : cells
}

/** What a finished run reports to the platform, for the server to check against the score. */
export function minesweeperDetails(state: MinesweeperState, seconds: number) {
  return {
    rows: state.rows,
    columns: state.columns,
    mines: state.mines,
    revealedCells: state.revealed,
    flagsUsed: state.flags,
    won: state.status === 'won' ? 1 : 0,
    moves: state.moves,
    seconds,
  }
}
