import { randomInt } from '@/games/shared/random'
import type { Direction, Point, SnakeAction, SnakeState } from '../types/snakeTypes'

/**
 * Snake rules as pure functions. No React, no timers, no `Math.random`:
 * `updateSnake(state, action)` always returns the same result for the same input.
 */

export type { Direction, Point, SnakeAction, SnakeState, SnakeStatus } from '../types/snakeTypes'

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
}

export function createSnakeGame({ width = DEFAULT_BOARD_SIZE, height = DEFAULT_BOARD_SIZE, seed }: SnakeOptions): SnakeState {
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
  if (!grow) return moved

  const score = state.score + 1
  if (snake.length === state.width * state.height) {
    return { ...moved, score, food: null, status: 'won' }
  }
  const food = spawnFood(snake, state.width, state.height, state.seed)
  return { ...moved, score, food: food.value, seed: food.seed }
}

function isFatal(state: SnakeState, head: Point): boolean {
  if (!inBounds(head, state.width, state.height)) return true
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
