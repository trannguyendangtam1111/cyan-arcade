/**
 * The arena's fixed geometry, in world units. A 400 × 600 playfield: a band at the top for the
 * score and lives, the bricks below it, and the paddle near the bottom.
 */

export const ARENA = {
  width: 400,
  height: 600,
  /** The top wall. Above it is the HUD band; the ball never goes there. */
  top: 40,
} as const

/** Bricks sit on a grid: 10 columns of 38 units, rows of 20, starting under the top wall. */
export const GRID = {
  columns: 10,
  cellWidth: 38,
  cellHeight: 20,
  left: 10,
  top: 92,
  brickWidth: 36,
  brickHeight: 16,
} as const

export const PADDLE = {
  /** The paddle's top edge. */
  y: 548,
  height: 12,
  width: 76,
  /** With Wide Paddle. */
  wideWidth: 120,
  /** How fast it chases the pointer, and how fast the arrow keys move it, units per second. */
  pointerSpeed: 2200,
  keySpeed: 560,
} as const

export const BALL_RADIUS = 7

/** Where a brick at (row, column) stands. */
export function cellOf(row: number, col: number) {
  return {
    x: GRID.left + col * GRID.cellWidth + (GRID.cellWidth - GRID.brickWidth) / 2,
    y: GRID.top + row * GRID.cellHeight + (GRID.cellHeight - GRID.brickHeight) / 2,
  }
}
