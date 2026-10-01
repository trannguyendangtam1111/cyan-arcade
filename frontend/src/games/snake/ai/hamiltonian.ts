import type { Point } from '../engine/snakeEngine'

/**
 * A Hamiltonian cycle: a closed loop that visits every cell of the board exactly once.
 * A snake that only ever moves "forward" along such a loop can never trap itself.
 *
 * `order[y * width + x]` is the position of that cell along the loop (0 .. width*height - 1).
 */
export interface HamiltonianCycle {
  length: number
  order: Int32Array
}

/**
 * Builds a cycle for any board with at least one even side (boards with two odd sides have none).
 *
 * For an even width the loop runs left along the top row, then snakes down and up through the
 * columns from left to right, ending directly below its starting cell:
 *
 * <pre>
 *   ← ← ← ←
 *   ↓ ↑ ↓ ↑
 *   ↓ ↑ ↓ ↑
 *   → ↑ → ↑
 * </pre>
 */
export function buildHamiltonianCycle(width: number, height: number): HamiltonianCycle | null {
  if (width < 2 || height < 2) return null

  if (width % 2 === 0) {
    return { length: width * height, order: buildForEvenWidth(width, height) }
  }
  if (height % 2 === 0) {
    // Build the mirrored board (even "width") and transpose it back.
    const transposed = buildForEvenWidth(height, width)
    const order = new Int32Array(width * height)
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) order[y * width + x] = transposed[x * height + y]
    }
    return { length: width * height, order }
  }
  return null
}

function buildForEvenWidth(width: number, height: number): Int32Array {
  const order = new Int32Array(width * height)
  let position = 0
  const visit = (x: number, y: number) => {
    order[y * width + x] = position++
  }

  for (let x = width - 1; x >= 0; x--) visit(x, 0)
  for (let x = 0; x < width; x++) {
    if (x % 2 === 0) {
      for (let y = 1; y < height; y++) visit(x, y)
    } else {
      for (let y = height - 1; y >= 1; y--) visit(x, y)
    }
  }
  return order
}

export function cycleIndex(cycle: HamiltonianCycle, width: number, point: Point): number {
  return cycle.order[point.y * width + point.x]
}

/** How many steps forward along the loop it takes to get from position `from` to position `to`. */
export function cycleDistance(cycle: HamiltonianCycle, from: number, to: number): number {
  return (to - from + cycle.length) % cycle.length
}
