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
  /**
   * Moves Limit: how many valid moves the run may make. The run ends right after the last one.
   * Absent in Classic, which has no limit; a Classic state never carries the key.
   */
  moveLimit?: number
  /**
   * Time Attack: the run's game-time clock. Absent in Classic and Moves Limit; a state without a time
   * limit never carries the key.
   */
  clock?: Game2048Clock
  /**
   * Puzzle: the tile that clears the run. The run ends the moment a tile of this value is made. Absent
   * in every other mode; a state without a target never carries the key.
   */
  target?: number
}

/**
 * The game-time clock of a timed run. It stands still until the first valid move, then advances only
 * in whole fixed steps (`CLOCK_STEP_MS`), never past its limit: reaching the limit ends the run.
 */
export interface Game2048Clock {
  /** Game time played so far, in milliseconds: a whole number of steps, at most `limitMs`. */
  elapsedMs: number
  /** The run's game time, in milliseconds. */
  limitMs: number
  /** Whether the run ended because its time ran out (not because the board got stuck). */
  timeUp: boolean
}

/** The rules of a run beyond Classic's, each opt-in. With none, the game is Classic. */
export interface Game2048Rules {
  /** Ends the run after this many valid moves (a positive whole number). */
  moveLimit?: number
  /** Ends the run once this much game time has been played (a positive whole number of clock steps). */
  timeLimitMs?: number
  /**
   * Starts the run from this board (16 cells, row-major) instead of two seeded tiles. The seed then
   * drives only the spawns after each move.
   */
  startBoard?: Board
  /** Clears, and ends, the run the moment a tile of this value is made (a power of two). */
  target?: number
}

/**
 * How a Puzzle run stands: still going, cleared (its target made, the last allowed move included),
 * failed by using every move, or failed with no move left.
 */
export type PuzzleOutcome = 'playing' | 'cleared' | 'out-of-moves' | 'stuck'

/** How a Moves Limit run stands: still going, ended by using every move, or ended with no move left. */
export type MoveLimitOutcome = 'playing' | 'limit-reached' | 'stuck'

/**
 * How a Time Attack run stands: waiting for its first valid move (the clock has not started), playing,
 * ended because the time ran out, or ended earlier with no move left.
 */
export type TimeAttackOutcome = 'waiting' | 'playing' | 'time-up' | 'stuck'

export interface SlideResult {
  board: number[]
  /** Points earned: the sum of all tiles created by merging. */
  gained: number
  /** False when the move changes nothing, which makes it illegal. */
  moved: boolean
  /** For every cell of the new board, the cells of the old board whose tiles ended up there. */
  origins: number[][]
}
