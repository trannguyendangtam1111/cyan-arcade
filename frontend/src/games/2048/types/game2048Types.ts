/** The data model of 2048. No behaviour lives here; the rules are in `engine/game2048Engine.ts`. */

export type Move = 'UP' | 'DOWN' | 'LEFT' | 'RIGHT'

/** Tile values in row-major order; 0 is an empty cell. */
export type Board = readonly number[]

export interface Game2048State {
  board: Board
  /**
   * A stable id per tile (0 for empty cells), parallel to `board`. A tile keeps its id while it
   * slides and gets a new one when it is created by a spawn or a merge. Only the UI needs this,
   * to animate tiles; the rules and the AI look at `board` alone.
   */
  tileIds: readonly number[]
  nextTileId: number
  score: number
  moves: number
  /** True once a 2048 tile has been made. The game continues afterwards. */
  won: boolean
  status: 'playing' | 'over'
  seed: number
}

export interface SlideResult {
  board: number[]
  /** Points earned: the sum of all tiles created by merging. */
  gained: number
  /** False when the move changes nothing, which makes it illegal. */
  moved: boolean
  /** For every cell of the new board, the cells of the old board whose tiles ended up there. */
  origins: number[][]
}
