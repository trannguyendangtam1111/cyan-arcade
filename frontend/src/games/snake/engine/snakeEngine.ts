import { randomInt } from '@/games/shared/random'
import type { Direction, Point, SnakeAction, SnakeObjective, SnakeState } from '../types/snakeTypes'
import type { SnakeMap } from './snakeMaps'

/**
 * Snake rules as pure functions. No React, no timers, no `Math.random`:
 * `updateSnake(state, action)` always returns the same result for the same input.
 */

export type { Direction, Point, SnakeAction, SnakeObjective, SnakeState, SnakeStatus } from '../types/snakeTypes'

export const DIRECTIONS: readonly Direction[] = ['UP', 'RIGHT', 'DOWN', 'LEFT']

const VECTORS: Record<Direction, Point> = {
  UP: { x: 0, y: -1 },
  RIGHT: { x: 1, y: 0 },
  DOWN: { x: 0, y: 1 },
  LEFT: { x: -1, y: 0 },
}

const OPPOSITES: Record<Direction, Direction> = { UP: 'DOWN', DOWN: 'UP', LEFT: 'RIGHT', RIGHT: 'LEFT' }

const MAX_QUEUED_TURNS = 2
const INITIAL_LENGTH = 3

export const DEFAULT_BOARD_SIZE = 16

/** Difficulty: the snake speeds up one level for every few apples, down to a fixed minimum delay. */
const POINTS_PER_LEVEL = 5
const BASE_TICK_MS = 150
const TICK_SPEED_UP_MS = 10
const MIN_TICK_MS = 70

/** The difficulty level for a score, starting at 1. */
export function snakeLevel(score: number): number {
  return Math.floor(score / POINTS_PER_LEVEL) + 1
}

/** Milliseconds between steps for a human player at the given score. */
export function tickDelay(score: number): number {
  return Math.max(MIN_TICK_MS, BASE_TICK_MS - (snakeLevel(score) - 1) * TICK_SPEED_UP_MS)
}

export function opposite(direction: Direction): Direction {
  return OPPOSITES[direction]
}

export function step(point: Point, direction: Direction): Point {
  const vector = VECTORS[direction]
  return { x: point.x + vector.x, y: point.y + vector.y }
}

export function samePoint(a: Point, b: Point): boolean {
  return a.x === b.x && a.y === b.y
}

export function inBounds(point: Point, width: number, height: number): boolean {
  return point.x >= 0 && point.y >= 0 && point.x < width && point.y < height
}

interface SnakeOptions {
  width?: number
  height?: number
  seed: number
  /** A map with walls. Without one the game is Classic: an open board of `width` x `height`. */
  map?: SnakeMap
  /** An Adventure stage's goal. Without one the game runs until the snake dies or fills the board. */
  objective?: SnakeObjective
}

export function createSnakeGame(options: SnakeOptions): SnakeState {
  const state = createBoardGame(options)
  if (!options.objective) return state
  const { apples, moveLimit } = options.objective
  return { ...state, objective: moveLimit === undefined ? { apples } : { apples, moveLimit } }
}

function createBoardGame({ width = DEFAULT_BOARD_SIZE, height = DEFAULT_BOARD_SIZE, seed, map }: SnakeOptions): SnakeState {
  if (map) return createMapGame(map, seed)

  const headX = Math.floor(width / 2)
  const y = Math.floor(height / 2)
  const snake = Array.from({ length: INITIAL_LENGTH }, (_, index) => ({ x: headX - index, y }))
  const food = spawnFood(snake, width, height, seed)

  return {
    width,
    height,
    snake,
    direction: 'RIGHT',
    turnQueue: [],
    food: food.value,
    score: 0,
    steps: 0,
    status: 'playing',
    seed: food.seed,
  }
}

function createMapGame(map: SnakeMap, seed: number): SnakeState {
  const snake = map.start.snake.map((cell) => ({ ...cell }))
  const walls = map.walls.map((cell) => ({ ...cell }))
  const food = spawnReachableFood(snake, map.width, map.height, walls, seed)

  return {
    width: map.width,
    height: map.height,
    snake,
    direction: map.start.direction,
    turnQueue: [],
    food: food?.value ?? null,
    score: 0,
    steps: 0,
    status: 'playing',
    seed: food?.seed ?? seed,
    walls,
  }
}

/** Whether the state is played on a map with walls (as opposed to the open Classic board). */
export function hasWalls(state: SnakeState): boolean {
  return (state.walls?.length ?? 0) > 0
}

/** Moves left before an Adventure stage's move limit, or `null` without one. */
export function movesLeft(state: SnakeState): number | null {
  const limit = state.objective?.moveLimit
  return limit === undefined ? null : Math.max(0, limit - state.steps)
}

/**
 * How an Adventure stage stands: still `playing`, `cleared` (the objective was reached), or failed by a
 * `collision` (wall, edge or body) or by running `out-of-moves`. `null` for a game without an objective.
 */
export type AdventureOutcome = 'playing' | 'cleared' | 'collision' | 'out-of-moves'

export function adventureOutcome(state: SnakeState): AdventureOutcome | null {
  if (!state.objective) return null
  if (state.status === 'playing') return 'playing'
  if (state.status === 'won') return 'cleared'
  // A fatal move is never counted, so a game that ended with every move used ran out of them.
  return movesLeft(state) === 0 ? 'out-of-moves' : 'collision'
}

/** Cells the snake can ever occupy: the whole board minus the walls. */
export function freeCells(state: SnakeState): number {
  return state.width * state.height - (state.walls?.length ?? 0)
}

export function updateSnake(state: SnakeState, action: SnakeAction): SnakeState {
  if (state.status !== 'playing') return state
  return action.type === 'turn' ? queueTurn(state, action.direction) : tick(state)
}

/**
 * Directions the snake can move in on the next tick without dying immediately.
 * Moving onto the tail's cell is legal unless the snake is about to grow, because the tail moves away.
 */
export function legalMoves(state: SnakeState): Direction[] {
  return DIRECTIONS.filter(
    (direction) => direction !== opposite(state.direction) && !isFatal(state, step(state.snake[0], direction)),
  )
}

/** The body after moving one cell. Shared by the engine and by AI look-ahead simulations. */
export function advance(snake: readonly Point[], direction: Direction, grow: boolean): Point[] {
  const head = step(snake[0], direction)
  return [head, ...(grow ? snake : snake.slice(0, -1))]
}

function queueTurn(state: SnakeState, direction: Direction): SnakeState {
  const heading = state.turnQueue.at(-1) ?? state.direction
  if (direction === heading || direction === opposite(heading)) return state
  if (state.turnQueue.length >= MAX_QUEUED_TURNS) return state
  return { ...state, turnQueue: [...state.turnQueue, direction] }
}

function tick(state: SnakeState): SnakeState {
  const [queued, ...turnQueue] = state.turnQueue
  const direction = queued ?? state.direction
  const head = step(state.snake[0], direction)

  if (isFatal(state, head)) {
    return { ...state, direction, turnQueue, status: 'over' }
  }

  const grow = state.food !== null && samePoint(head, state.food)
  const snake = advance(state.snake, direction, grow)
  const moved = { ...state, snake, direction, turnQueue, steps: state.steps + 1 }

  if (!grow) {
    // A map that had no reachable cell for food tries again now that the snake has moved.
    if (state.food === null && hasWalls(state)) return withinMoveLimit(withMapFood(moved))
    return withinMoveLimit(moved)
  }

  const score = state.score + 1
  if (snake.length === freeCells(state)) {
    return { ...moved, score, food: null, status: 'won' }
  }
  // An objective reached ends the stage on this move, even on its last allowed one; no more food is drawn.
  if (state.objective && score >= state.objective.apples) {
    return { ...moved, score, food: null, status: 'won' }
  }
  if (hasWalls(state)) return withinMoveLimit(withMapFood({ ...moved, score }))

  const food = spawnFood(snake, state.width, state.height, state.seed)
  return withinMoveLimit({ ...moved, score, food: food.value, seed: food.seed })
}

/** Ends an Adventure stage whose last allowed move has been made without reaching its objective. */
function withinMoveLimit(state: SnakeState): SnakeState {
  const limit = state.objective?.moveLimit
  return limit !== undefined && state.steps >= limit ? { ...state, status: 'over' } : state
}

/** Places food on a map, or leaves it `null` (seed untouched) while no free cell is reachable. */
function withMapFood(state: SnakeState): SnakeState {
  const food = spawnReachableFood(state.snake, state.width, state.height, state.walls ?? [], state.seed)
  return food ? { ...state, food: food.value, seed: food.seed } : { ...state, food: null }
}

function isFatal(state: SnakeState, head: Point): boolean {
  if (!inBounds(head, state.width, state.height)) return true
  if (state.walls?.some((cell) => samePoint(cell, head))) return true
  const grow = state.food !== null && samePoint(head, state.food)
  const body = grow ? state.snake : state.snake.slice(0, -1)
  return body.some((cell) => samePoint(cell, head))
}

/** Picks a uniformly random free cell. */
function spawnFood(snake: readonly Point[], width: number, height: number, seed: number) {
  const occupied = new Set(snake.map((cell) => cell.y * width + cell.x))
  const pick = randomInt(seed, width * height - occupied.size)

  let remaining = pick.value
  for (let index = 0; index < width * height; index++) {
    if (occupied.has(index)) continue
    if (remaining === 0) {
      return { value: { x: index % width, y: Math.floor(index / width) }, seed: pick.seed }
    }
    remaining--
  }
  throw new Error('No free cell left for food')
}

/**
 * Maps: picks a uniformly random cell among those the head can reach right now, or `null` (no random
 * number used) when there is none. Reachable means connected to the head through cells that are not
 * walls and not body; the tail's cell counts as passable, because it moves away before the head can get
 * there (the same rule as {@link legalMoves}). Food never lands on the snake, the tail included.
 * Candidates are counted in row-major order, so the result depends only on the state and the seed.
 */
function spawnReachableFood(snake: readonly Point[], width: number, height: number, walls: readonly Point[], seed: number) {
  const blocked = new Uint8Array(width * height)
  for (const cell of walls) blocked[cell.y * width + cell.x] = 1
  for (const cell of snake.slice(0, -1)) blocked[cell.y * width + cell.x] = 1

  const reached = new Uint8Array(width * height)
  const head = snake[0]
  reached[head.y * width + head.x] = 1
  const stack: Point[] = [head]
  while (stack.length > 0) {
    const current = stack.pop()!
    for (const direction of DIRECTIONS) {
      const next = step(current, direction)
      if (!inBounds(next, width, height)) continue
      const index = next.y * width + next.x
      if (reached[index] || blocked[index]) continue
      reached[index] = 1
      stack.push(next)
    }
  }
  for (const cell of snake) reached[cell.y * width + cell.x] = 0

  const candidates: number[] = []
  for (let index = 0; index < width * height; index++) if (reached[index]) candidates.push(index)
  if (candidates.length === 0) return null

  const pick = randomInt(seed, candidates.length)
  const index = candidates[pick.value]
  return { value: { x: index % width, y: Math.floor(index / width) }, seed: pick.seed }
}
