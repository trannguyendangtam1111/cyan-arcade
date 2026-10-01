import { describe, expect, it } from 'vitest'
import {
  createSnakeGame,
  inBounds,
  legalMoves,
  step,
  updateSnake,
  type Point,
  type SnakeState,
} from '../engine/snakeEngine'
import { buildHamiltonianCycle } from './hamiltonian'
import { createGrid, reachableArea, shortestPath } from './pathfinding'
import { createSnakeAi, loopSpan } from './snakeAi'

function stateOf(overrides: Partial<SnakeState> & { snake: Point[] }): SnakeState {
  return {
    width: 6,
    height: 6,
    direction: 'RIGHT',
    turnQueue: [],
    food: { x: 5, y: 5 },
    score: 0,
    steps: 0,
    status: 'playing',
    seed: 1,
    ...overrides,
  }
}

/** Plays a whole game with the AI through the real engine. */
function playToEnd(state: SnakeState, maxSteps: number): SnakeState {
  const ai = createSnakeAi()
  while (state.status === 'playing' && state.steps < maxSteps) {
    state = updateSnake(state, { type: 'turn', direction: ai.getNextAction(state) })
    state = updateSnake(state, { type: 'tick' })
  }
  return state
}

describe('Hamiltonian cycle', () => {
  it.each([
    [16, 16],
    [6, 4],
    [4, 7],
    [5, 6],
  ])('visits every cell of a %ix%i board once, moving one cell at a time', (width, height) => {
    const cycle = buildHamiltonianCycle(width, height)!
    const cells: Point[] = []
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) cells[cycle.order[y * width + x]] = { x, y }
    }

    expect(new Set(cycle.order).size).toBe(width * height)
    cells.forEach((cell, index) => {
      const next = cells[(index + 1) % cells.length]
      expect(Math.abs(cell.x - next.x) + Math.abs(cell.y - next.y)).toBe(1)
    })
  })

  it('does not exist when both sides are odd', () => {
    expect(buildHamiltonianCycle(5, 5)).toBeNull()
  })

  it('has the starting snake lined up along the loop', () => {
    const state = createSnakeGame({ seed: 1 })

    // Neighbouring columns are 15 loop steps apart on a 16x16 board.
    expect(loopSpan(state, buildHamiltonianCycle(state.width, state.height)!)).toBe(30)
  })

  it('detects a body that runs against the loop', () => {
    const state = stateOf({ width: 8, height: 8, snake: [{ x: 4, y: 4 }, { x: 5, y: 4 }, { x: 6, y: 4 }], direction: 'LEFT' })

    expect(loopSpan(state, buildHamiltonianCycle(8, 8)!)).toBeNull()
  })
})

describe('pathfinding', () => {
  it('finds the shortest route around an obstacle', () => {
    // A wall at x=2 for y=0..3 forces a detour through row 4.
    const wall = [0, 1, 2, 3].map((y) => ({ x: 2, y }))
    const path = shortestPath(createGrid(5, 5, wall), { x: 0, y: 0 }, { x: 4, y: 0 })!

    expect(path).toHaveLength(12)
    let position = { x: 0, y: 0 }
    for (const direction of path) {
      position = step(position, direction)
      expect(wall).not.toContainEqual(position)
    }
    expect(position).toEqual({ x: 4, y: 0 })
  })

  it('returns null when the target is sealed off', () => {
    const wall = [0, 1, 2, 3, 4].map((y) => ({ x: 2, y }))

    expect(shortestPath(createGrid(5, 5, wall), { x: 0, y: 0 }, { x: 4, y: 0 })).toBeNull()
  })

  it('measures how much space is reachable', () => {
    const wall = [0, 1, 2, 3, 4].map((y) => ({ x: 2, y }))
    const grid = createGrid(5, 5, wall)

    expect(reachableArea(grid, { x: 0, y: 0 })).toBe(9)
    expect(reachableArea(grid, { x: 4, y: 4 })).toBe(9)
  })
})

describe('Snake AI decisions', () => {
  const ai = createSnakeAi()

  it('only ever returns a legal move', () => {
    let state = createSnakeGame({ width: 8, height: 8, seed: 3 })
    for (let i = 0; i < 500 && state.status === 'playing'; i++) {
      const action = ai.getNextAction(state)
      expect(legalMoves(state)).toContain(action)
      state = updateSnake(updateSnake(state, { type: 'turn', direction: action }), { type: 'tick' })
    }
  })

  it('avoids a wall directly ahead', () => {
    const state = stateOf({ snake: [{ x: 5, y: 3 }, { x: 4, y: 3 }, { x: 3, y: 3 }] })
    const next = step(state.snake[0], ai.getNextAction(state))

    expect(inBounds(next, state.width, state.height)).toBe(true)
  })

  it('avoids its own body', () => {
    // Head at (2,2) heading up; (2,1) is body. Only LEFT leads to a free cell.
    const snake = [
      { x: 2, y: 2 },
      { x: 2, y: 3 },
      { x: 3, y: 3 },
      { x: 3, y: 2 },
      { x: 3, y: 1 },
      { x: 2, y: 1 },
      { x: 1, y: 1 },
    ]
    const state = stateOf({ snake, direction: 'UP', food: { x: 5, y: 5 } })

    expect(ai.getNextAction(state)).toBe('LEFT')
  })

  it('takes a shortcut across the loop towards the food when that is safe', () => {
    const state = createSnakeGame({ seed: 1 })
    const withFood = { ...state, food: { x: 12, y: 8 } }

    expect(ai.decide(withFood)).toEqual({ action: 'RIGHT', strategy: 'shortcut' })
  })

  it('follows the shortest path to food when the body is not on the loop', () => {
    // Heading left in a lower row is against the loop, so the search planner takes over.
    const state = stateOf({
      width: 8,
      height: 8,
      snake: [{ x: 4, y: 4 }, { x: 5, y: 4 }, { x: 6, y: 4 }],
      direction: 'LEFT',
      food: { x: 1, y: 4 },
    })

    expect(ai.decide(state)).toEqual({ action: 'LEFT', strategy: 'path' })
  })

  it('refuses a food path that would trap it, and keeps its escape route instead', () => {
    // 5x5 board (no loop exists). The food at (0,0) is one step away, but it sits in a one-cell
    // pocket walled in by the body: after eating it the head could not move at all.
    const snake = [
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 1 },
      { x: 0, y: 2 },
      { x: 1, y: 2 },
      { x: 2, y: 2 },
    ]
    const state = stateOf({ width: 5, height: 5, snake, direction: 'UP', food: { x: 0, y: 0 } })

    expect(legalMoves(state).sort()).toEqual(['LEFT', 'RIGHT'])
    expect(ai.decide(state)).toEqual({ action: 'RIGHT', strategy: 'survive' })
  })

  it('prefers the larger region when one move leads into a dead end', () => {
    // Head at (2,2) heading up, with its own body directly above at (2,1). The body also encloses
    // a two-cell pocket on the left, while the right side opens onto the rest of the board.
    const snake = [
      { x: 2, y: 2 },
      { x: 2, y: 3 },
      { x: 2, y: 4 },
      { x: 1, y: 4 },
      { x: 0, y: 4 },
      { x: 0, y: 3 },
      { x: 0, y: 2 },
      { x: 0, y: 1 },
      { x: 1, y: 1 },
      { x: 2, y: 1 },
      { x: 3, y: 1 },
    ]
    const state = stateOf({ width: 5, height: 5, snake, direction: 'UP', food: { x: 4, y: 4 } })

    // LEFT reaches only the 2-cell pocket (1,2),(1,3); RIGHT reaches the rest of the board.
    expect(legalMoves(state).sort()).toEqual(['LEFT', 'RIGHT'])
    expect(ai.getNextAction(state)).toBe('RIGHT')
  })

  it('reports when it is trapped with no legal move', () => {
    const snake = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }, { x: 0, y: 2 }]
    const state = stateOf({ snake, direction: 'LEFT' })

    expect(ai.decide(state).strategy).toBe('trapped')
  })

  it('is deterministic: the same state always gives the same move', () => {
    const state = createSnakeGame({ seed: 99 })

    expect(createSnakeAi().decide(state)).toEqual(createSnakeAi().decide(state))
  })
})

describe('Snake AI full games', () => {
  it.each([1, 2, 3])('fills the entire 16x16 board without dying (seed %i)', (seed) => {
    const end = playToEnd(createSnakeGame({ seed }), 200_000)

    expect(end.status).toBe('won')
    expect(end.snake).toHaveLength(256)
  })

  it('fills a board that needs the transposed loop (odd width, even height)', () => {
    const end = playToEnd(createSnakeGame({ width: 7, height: 8, seed: 5 }), 50_000)

    expect(end.status).toBe('won')
  })

  it('survives a long time on a board with no loop, using search alone', () => {
    const end = playToEnd(createSnakeGame({ width: 9, height: 9, seed: 4 }), 3_000)

    expect(end.score).toBeGreaterThanOrEqual(25)
  })
})
