/** The data model of Tetris. No behaviour lives here; the rules are in `engine/tetrisEngine.ts`. */

export type PieceType = 'I' | 'O' | 'T' | 'S' | 'Z' | 'J' | 'L'

export type Cell = PieceType | null

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
}

/**
 * Everything that can happen in a game. `TICK` is gravity; the rest are the player's (or the AI's)
 * inputs.
 */
export type TetrisAction = 'LEFT' | 'RIGHT' | 'ROTATE_CW' | 'ROTATE_CCW' | 'SOFT_DROP' | 'HARD_DROP' | 'TICK'
