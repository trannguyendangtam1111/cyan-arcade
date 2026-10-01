/** The data model of Snake. No behaviour lives here; the rules are in `engine/snakeEngine.ts`. */

export type Direction = 'UP' | 'RIGHT' | 'DOWN' | 'LEFT'

export interface Point {
  x: number
  y: number
}

export type SnakeStatus = 'playing' | 'over' | 'won'

export interface SnakeState {
  width: number
  height: number
  /** Body cells, head first. */
  snake: readonly Point[]
  /** Direction of the most recent move. */
  direction: Direction
  /** Turns waiting to be applied, one per tick, so two quick key presses are both honoured. */
  turnQueue: readonly Direction[]
  /** `null` only when the snake fills the whole board. */
  food: Point | null
  score: number
  steps: number
  status: SnakeStatus
  seed: number
}

export type SnakeAction = { type: 'turn'; direction: Direction } | { type: 'tick' }
