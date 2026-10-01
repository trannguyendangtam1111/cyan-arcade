import { DIRECTIONS, inBounds, step, type Direction, type Point } from '../engine/snakeEngine'

/** Grid searches used by the Snake AI. Cells are addressed as `y * width + x`. */

export interface Grid {
  width: number
  height: number
  /** 1 where a cell cannot be entered. */
  blocked: Uint8Array
}

export function createGrid(width: number, height: number, obstacles: readonly Point[]): Grid {
  const blocked = new Uint8Array(width * height)
  for (const cell of obstacles) blocked[cell.y * width + cell.x] = 1
  return { width, height, blocked }
}

/**
 * Breadth-first search for the shortest route, returned as the moves to make.
 * The start cell is never treated as blocked; returns `null` when the target is unreachable.
 */
export function shortestPath(grid: Grid, from: Point, to: Point): Direction[] | null {
  const { width, height, blocked } = grid
  const start = from.y * width + from.x
  const goal = to.y * width + to.x
  if (start === goal) return []

  // cameFrom[cell] = index into DIRECTIONS of the move that reached it, or -1 if unvisited.
  const cameFrom = new Int8Array(width * height).fill(-1)
  const queue: Point[] = [from]
  const visited = new Uint8Array(width * height)
  visited[start] = 1

  for (let head = 0; head < queue.length; head++) {
    const current = queue[head]
    for (let d = 0; d < DIRECTIONS.length; d++) {
      const next = step(current, DIRECTIONS[d])
      if (!inBounds(next, width, height)) continue
      const index = next.y * width + next.x
      if (visited[index] || blocked[index]) continue
      visited[index] = 1
      cameFrom[index] = d

      if (index === goal) return reconstruct(cameFrom, width, from, to)
      queue.push(next)
    }
  }
  return null
}

function reconstruct(cameFrom: Int8Array, width: number, from: Point, to: Point): Direction[] {
  const path: Direction[] = []
  let current = to
  while (current.x !== from.x || current.y !== from.y) {
    const direction = DIRECTIONS[cameFrom[current.y * width + current.x]]
    path.push(direction)
    // Walk backwards along the move that reached this cell.
    const back = step({ x: 0, y: 0 }, direction)
    current = { x: current.x - back.x, y: current.y - back.y }
  }
  return path.reverse()
}

/** Flood fill: how many free cells can be reached from `from` (not counting `from` itself). */
export function reachableArea(grid: Grid, from: Point): number {
  const { width, height, blocked } = grid
  const visited = new Uint8Array(width * height)
  visited[from.y * width + from.x] = 1
  const stack: Point[] = [from]
  let area = 0

  while (stack.length > 0) {
    const current = stack.pop()!
    for (const direction of DIRECTIONS) {
      const next = step(current, direction)
      if (!inBounds(next, width, height)) continue
      const index = next.y * width + next.x
      if (visited[index] || blocked[index]) continue
      visited[index] = 1
      area++
      stack.push(next)
    }
  }
  return area
}
