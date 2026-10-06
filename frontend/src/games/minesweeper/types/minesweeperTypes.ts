/** The size of a board and how many mines it hides. */
export interface MinesweeperConfig {
  rows: number
  columns: number
  mines: number
}

export interface Cell {
  mine: boolean
  /** How many of the (up to) eight neighbours are mines. */
  adjacent: number
  revealed: boolean
  flagged: boolean
}

/**
 * `ready` until the first reveal (when the mines are laid, never under that first cell), then
 * `playing` until every safe cell is uncovered (`won`) or a mine is (`lost`).
 */
export type MinesweeperStatus = 'ready' | 'playing' | 'won' | 'lost'

export interface MinesweeperState extends MinesweeperConfig {
  /** Row by row: the cell at row `r`, column `c` is `cells[r * columns + c]`. */
  cells: Cell[]
  status: MinesweeperStatus
  /** Drives where the mines go. Kept in the state so the engine stays pure. */
  seed: number
  /** Safe cells uncovered so far. */
  revealed: number
  /** Flags on the board now. */
  flags: number
  /** Reveals that changed the board, including a losing one. Flags do not count. */
  moves: number
  /** The mine that went off, once the game is lost. */
  exploded: number | null
}

export type MinesweeperAction = { type: 'REVEAL'; index: number } | { type: 'FLAG'; index: number }
