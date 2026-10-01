import type { GameAI } from '@/games/shared/ai'
import { advance, legalMoves, samePoint, step, type Direction, type Point, type SnakeState } from '../engine/snakeEngine'
import { buildHamiltonianCycle, cycleDistance, cycleIndex, type HamiltonianCycle } from './hamiltonian'
import { createGrid, reachableArea, shortestPath } from './pathfinding'

/**
 * Snake AI: a hybrid of a Hamiltonian-cycle strategy and search.
 *
 * 1. Safe loop with shortcuts (the normal case). The board has a fixed loop through every cell.
 *    As long as the snake's body lies in order along that loop, moving forward along it can never
 *    cause a collision. Each turn the AI jumps as far ahead on the loop as it safely can towards the
 *    food, without jumping past the food or reaching its own tail. This is provably safe and ends
 *    with the board completely filled.
 *
 * 2. Search (fallback). For positions where the body is not lined up along the loop, or boards with
 *    no loop (both sides odd): take the shortest path to the food only if, after eating, the head
 *    could still reach the tail; otherwise pick the move that keeps the most space open.
 *
 * Decisions depend only on the state passed in. Nothing is scripted or remembered between calls.
 */

export type SnakeStrategy = 'shortcut' | 'loop' | 'path' | 'survive' | 'trapped'

export interface SnakeDecision {
  action: Direction
  strategy: SnakeStrategy
}

export interface SnakeAI extends GameAI<SnakeState, Direction> {
  /** Like `getNextAction`, but also says which strategy produced the move. */
  decide(state: SnakeState): SnakeDecision
}

export function createSnakeAi(): SnakeAI {
  // The loop depends only on the board size, so build it once per size.
  const cycles = new Map<string, HamiltonianCycle | null>()
  const cycleFor = (width: number, height: number) => {
    const key = `${width}x${height}`
    if (!cycles.has(key)) cycles.set(key, buildHamiltonianCycle(width, height))
    return cycles.get(key) ?? null
  }

  const decide = (state: SnakeState): SnakeDecision => {
    const legal = legalMoves(state)
    if (legal.length === 0) return { action: state.direction, strategy: 'trapped' }

    const cycle = cycleFor(state.width, state.height)
    return (cycle && decideOnLoop(state, cycle, legal)) ?? decideBySearch(state, legal)
  }

  return { decide, getNextAction: (state) => decide(state).action }
}

/**
 * Distance along the loop from the tail to the head when the body is in loop order, else `null`.
 * "In loop order" means walking from tail to head always moves forward and never laps the loop.
 */
export function loopSpan(state: SnakeState, cycle: HamiltonianCycle): number | null {
  const { snake, width } = state
  let span = 0
  for (let i = snake.length - 1; i > 0; i--) {
    span += cycleDistance(cycle, cycleIndex(cycle, width, snake[i]), cycleIndex(cycle, width, snake[i - 1]))
    if (span >= cycle.length) return null
  }
  return span
}

function decideOnLoop(state: SnakeState, cycle: HamiltonianCycle, legal: Direction[]): SnakeDecision | null {
  const span = loopSpan(state, cycle)
  if (span === null) return null

  const { snake, width, food } = state
  const head = cycleIndex(cycle, width, snake[0])
  // Free loop cells in front of the head before it would meet its own tail.
  const gapToTail = cycle.length - span
  const distanceToFood = food ? cycleDistance(cycle, head, cycleIndex(cycle, width, food)) : cycle.length

  // A jump of `d` cells stays safe while d < gapToTail, and must not skip past the food.
  // The next loop cell (d = 1) is always allowed: it is either free or the tail, which moves away.
  const maxJump = Math.max(1, Math.min(gapToTail - 1, distanceToFood))

  let best: { direction: Direction; jump: number } | null = null
  for (const direction of legal) {
    const jump = cycleDistance(cycle, head, cycleIndex(cycle, width, step(snake[0], direction)))
    if (jump <= maxJump && (best === null || jump > best.jump)) best = { direction, jump }
  }
  if (best === null) return null
  return { action: best.direction, strategy: best.jump === 1 ? 'loop' : 'shortcut' }
}

function decideBySearch(state: SnakeState, legal: Direction[]): SnakeDecision {
  const { snake, food, width, height } = state

  if (food) {
    // The tail cell is free to enter: it will have moved by the time the head gets there.
    const path = shortestPath(createGrid(width, height, snake.slice(0, -1)), snake[0], food)
    if (path && path.length > 0 && legal.includes(path[0])) {
      let future = snake as readonly Point[]
      path.forEach((direction, index) => {
        future = advance(future, direction, index === path.length - 1)
      })
      if (canReachTail(future, width, height)) return { action: path[0], strategy: 'path' }
    }
  }

  // No safe route to the food: keep as much room as possible and stay connected to the tail.
  let best: { direction: Direction; reachesTail: boolean; area: number } | null = null
  for (const direction of legal) {
    const grow = food !== null && samePoint(step(snake[0], direction), food)
    const future = advance(snake, direction, grow)
    const reachesTail = canReachTail(future, width, height)
    const area = reachableArea(createGrid(width, height, future.slice(0, -1)), future[0])

    const better =
      best === null ||
      (reachesTail && !best.reachesTail) ||
      (reachesTail === best.reachesTail && area > best.area)
    if (better) best = { direction, reachesTail, area }
  }
  return { action: best!.direction, strategy: 'survive' }
}

/** A snake whose head can reach its tail always has an escape route: it can follow the tail. */
function canReachTail(snake: readonly Point[], width: number, height: number): boolean {
  if (snake.length < 3) return true
  const grid = createGrid(width, height, snake.slice(0, -1))
  return shortestPath(grid, snake[0], snake[snake.length - 1]) !== null
}
