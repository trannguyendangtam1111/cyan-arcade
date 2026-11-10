/** The data model of Tetris. No behaviour lives here; the rules are in `engine/tetrisEngine.ts`. */

export type PieceType = 'I' | 'O' | 'T' | 'S' | 'Z' | 'J' | 'L'

/**
 * A garbage block: part of a Challenge stage's rows of garbage, each full but for one gap. Never a
 * piece, so it never appears in Classic, Ultra or Sprint.
 */
export type Garbage = 'G'

/** What a board cell holds: a locked piece's block, a garbage block, or nothing. */
export type Cell = PieceType | Garbage | null

export interface Point {
  x: number
  y: number
}

export interface Piece {
  type: PieceType
  /** Quarter turns clockwise from the spawn orientation, 0..3. */
  rotation: number
  /** Top-left corner of the piece's bounding box, in board cells. `y` may be negative at the top. */
  x: number
  y: number
}

export interface TetrisState {
  /** Locked cells in row-major order; row 0 is the top. */
  board: readonly Cell[]
  /** The falling piece. */
  piece: Piece
  /** Upcoming pieces, next first. Always holds at least `PREVIEW_COUNT` entries. */
  queue: readonly PieceType[]
  score: number
  lines: number
  level: number
  /** How many pieces have been locked so far. Identifies the current piece. */
  pieces: number
  status: 'playing' | 'over'
  seed: number
  /**
   * The game clock of a timed game; absent from a Classic game, which keeps no game time. Only `STEP`
   * moves it, so game time is a pure function of the actions played.
   */
  clock?: TetrisClock
  /**
   * The garbage of a Challenge stage; absent from every other game, which never has garbage. A
   * Challenge stage always has a clock too: its objective, when met, is the clock's `goalReached`.
   */
  challenge?: TetrisChallenge
}

/** The garbage rules and garbage count of a Challenge stage. */
export interface TetrisChallenge {
  /** The stage's fixed level: its gravity, whatever the lines cleared. */
  level: number
  /** A row of garbage rises from the bottom after every this many pieces, or `null` for none. */
  riseEvery: number | null
  /** Whether the stage is won by clearing every garbage block (rather than by a line goal). */
  dig: boolean
  /** Rows of garbage put on the board so far: the starting rows, then every row that rose. */
  garbageAdded: number
  /** Rows of garbage cleared so far. Garbage is left on the board while this is below `garbageAdded`. */
  garbageCleared: number
  /** Column of the gap in the most recent garbage row (the bottom one), so the next gap differs. */
  lastGap: number
  /** The seed of the garbage gaps, apart from the piece bag's: rising rows never change the pieces. */
  garbageSeed: number
}

/** Game time of a timed game, in whole steps of `STEP_MS`. Lives in the state, so a pause keeps it. */
export interface TetrisClock {
  /** Game time played. */
  elapsedMs: number
  /** Game time since the last gravity step. */
  sinceGravityMs: number
  /** The game time at which the run ends, or `null` for a clock without a limit. */
  limitMs: number | null
  /** Whether the run ended because the clock reached `limitMs` (rather than the stack the top). */
  timeUp: boolean
  /** The lines that end the run as soon as a clear reaches them (Sprint), or `null` for none. */
  lineGoal: number | null
  /**
   * Whether the run ended by meeting its objective: `lineGoal` (Sprint, a Challenge line goal) or,
   * on a Challenge dig stage, the last garbage cleared. A finished run, at `elapsedMs`.
   */
  goalReached: boolean
}

/**
 * Everything that can happen in a game. `TICK` is a Classic game's gravity, on a real-time timer;
 * `STEP` is one fixed step of a timed game's clock, which brings its gravity with it. The rest are
 * the player's (or the AI's) inputs.
 */
export type TetrisAction =
  | 'LEFT'
  | 'RIGHT'
  | 'ROTATE_CW'
  | 'ROTATE_CCW'
  | 'SOFT_DROP'
  | 'HARD_DROP'
  | 'TICK'
  | 'STEP'
