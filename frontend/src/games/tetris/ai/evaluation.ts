import { HEIGHT, WIDTH, type Cell } from '../engine/tetrisEngine'

/** Measurements of a Tetris stack that say how healthy it is. */
export interface BoardFeatures {
  /** Height of each column: rows from its topmost block down to the floor. */
  heights: number[]
  /** Sum of all column heights. A low stack leaves time to react. */
  aggregateHeight: number
  /** Empty cells with a block somewhere above them. Holes block line clears until dug out. */
  holes: number
  /** Sum of height differences between neighbouring columns. A flat surface fits every piece. */
  bumpiness: number
  /** Sum of the depths of columns that are lower than both neighbours (walls count as tall). */
  wells: number
  maxHeight: number
}

export function boardFeatures(board: readonly Cell[]): BoardFeatures {
  const heights: number[] = []
  let holes = 0

  for (let x = 0; x < WIDTH; x++) {
    let height = 0
    for (let y = 0; y < HEIGHT; y++) {
      const filled = board[y * WIDTH + x] !== null
      if (filled && height === 0) height = HEIGHT - y
      else if (!filled && height > 0) holes++
    }
    heights.push(height)
  }

  let bumpiness = 0
  let wells = 0
  for (let x = 0; x < WIDTH; x++) {
    if (x > 0) bumpiness += Math.abs(heights[x] - heights[x - 1])
    const left = x === 0 ? HEIGHT : heights[x - 1]
    const right = x === WIDTH - 1 ? HEIGHT : heights[x + 1]
    const depth = Math.min(left, right) - heights[x]
    if (depth > 0) wells += depth
  }

  return {
    heights,
    aggregateHeight: heights.reduce((sum, height) => sum + height, 0),
    holes,
    bumpiness,
    wells,
    maxHeight: Math.max(...heights),
  }
}

/**
 * Weights for the four features that matter most. They were found with a genetic algorithm by
 * Yiyuan Lee ("Tetris AI – The (Near) Perfect Bot") and are widely reproduced.
 */
export const WEIGHTS = {
  aggregateHeight: -0.510066,
  linesCleared: 0.760666,
  holes: -0.35663,
  bumpiness: -0.184483,
}

/** Heuristic value of a stack reached by clearing `linesCleared` lines on the way. Higher is better. */
export function evaluateBoard(board: readonly Cell[], linesCleared: number): number {
  const features = boardFeatures(board)
  return (
    WEIGHTS.aggregateHeight * features.aggregateHeight +
    WEIGHTS.linesCleared * linesCleared +
    WEIGHTS.holes * features.holes +
    WEIGHTS.bumpiness * features.bumpiness
  )
}
