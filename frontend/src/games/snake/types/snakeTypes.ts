/** The data model of Snake. No behaviour lives here; the rules are in `engine/snakeEngine.ts`. */

export type Direction = 'UP' | 'RIGHT' | 'DOWN' | 'LEFT'

export interface Point {
  x: number
  y: number
}

export type SnakeStatus = 'playing' | 'over' | 'won'

/**
 * An Adventure stage's goal: eat `apples` apples, within `moveLimit` moves when there is one. Reaching it
 * ends the game as `won` on that move; using the last move without reaching it ends it as `over`.
 */
export interface SnakeObjective {
  readonly apples: number
  readonly moveLimit?: number
}

export interface SnakeState {
  width: number
  height: number
  /** Body cells, head first. */
  snake: readonly Point[]
  /** Direction of the most recent move. */
  direction: Direction
  /** Turns waiting to be applied, one per tick, so two quick key presses are both honoured. */
  turnQueue: readonly Direction[]
  /**
   * `null` when the snake fills every free cell (the game is won), or, on a map with walls, while no free
   * cell is reachable from the head: the engine then tries again after every move.
   */
  food: Point | null
  score: number
  steps: number
  status: SnakeStatus
  seed: number
  /** Wall cells of a map; absent on the Classic board. Walls are fatal, like the board edge. */
  walls?: readonly Point[]
  /**
   * An Adventure stage's goal; absent in Classic and map runs. Apples eaten are `score`, moves used are
   * `steps` (only completed moves count; the fatal one does not).
   */
  objective?: SnakeObjective
}

export type SnakeAction = { type: 'turn'; direction: Direction } | { type: 'tick' }
