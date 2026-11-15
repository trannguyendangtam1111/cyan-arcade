import { describe, expect, it } from 'vitest'
import {
  createSnakeGame,
  hasWalls,
  inBounds,
  legalMoves,
  step,
  updateSnake,
  type Point,
  type SnakeState,
} from '../engine/snakeEngine'
import { SNAKE_MAPS, snakeMap } from '../engine/snakeMaps'
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

/** 32-bit FNV-1a, to pin a long move sequence in one number. */
function fingerprint(text: string): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash
}

describe('Classic regression (golden seeds)', () => {
  // Recorded with the engine and AI as they were before maps existed: the first 15 apples, and every
  // move and strategy of the first 3000 steps. Classic must keep producing exactly these.
  it.each([
    [1, 100, 304553386, 1723875482, '1,10 0,0 9,8 11,15 6,15 5,4 13,9 11,11 13,6 14,15 0,7 4,8 6,2 8,6 1,4'],
    [42, 104, -959117913, 3518959645, '11,9 0,7 10,13 9,10 11,2 8,8 7,4 3,10 15,13 3,7 5,4 3,14 14,11 9,4 12,3'],
    [2026, 100, 304555411, 4071283098, '3,7 13,4 10,10 15,9 5,2 15,3 1,11 15,12 7,4 1,1 13,1 3,10 7,6 11,1 12,2'],
  ])('seed %i plays the same apples and moves as before', (seed, score, finalSeed, moves, apples) => {
    const ai = createSnakeAi()
    let state = createSnakeGame({ seed })
    const eaten = [state.food!]
    let played = ''
    while (state.status === 'playing' && state.steps < 3000) {
      const decision = ai.decide(state)
      played += decision.action[0] + decision.strategy[0]
      const before = state.score
      state = updateSnake(updateSnake(state, { type: 'turn', direction: decision.action }), { type: 'tick' })
      if (state.score !== before && state.food && eaten.length < 15) eaten.push(state.food)
    }

    expect(eaten.map((cell) => `${cell.x},${cell.y}`).join(' ')).toBe(apples)
    expect({ status: state.status, score: state.score, seed: state.seed, moves: fingerprint(played) }).toEqual({
      status: 'playing',
      score,
      seed: finalSeed,
      moves,
    })
  })

  it('creates Classic games without walls', () => {
    const state = createSnakeGame({ seed: 1 })

    expect('walls' in state).toBe(false)
    expect(hasWalls(state)).toBe(false)
  })
})

describe('Snake AI on maps', () => {
  const isWall = (state: SnakeState, cell: Point) => state.walls!.some((wall) => wall.x === cell.x && wall.y === cell.y)

  it('turns away from a wall directly ahead', () => {
    const state = stateOf({ snake: [{ x: 2, y: 2 }, { x: 1, y: 2 }], walls: [{ x: 3, y: 2 }], food: { x: 4, y: 2 } })

    const move = createSnakeAi().getNextAction(state)
    expect(legalMoves(state)).toContain(move)
    expect(isWall(state, step(state.snake[0], move))).toBe(false)
  })

  it('routes around walls to reach the food', () => {
    // A wall between the head and the food: the straight line is blocked.
    const walls = [{ x: 3, y: 1 }, { x: 3, y: 2 }, { x: 3, y: 3 }]
    const state = stateOf({ snake: [{ x: 2, y: 2 }, { x: 1, y: 2 }, { x: 0, y: 2 }], walls, food: { x: 4, y: 2 } })

    const end = playToEnd(state, 12)
    expect(end.score).toBeGreaterThanOrEqual(1)
    expect(end.status).toBe('playing')
  })

  it('does not use the Hamiltonian loop on a walled map, even when the body lies along it', () => {
    // Pillars starts the snake exactly where Classic does, lined up along the open-board loop.
    const classic = createSnakeGame({ seed: 4 })
    const pillars = createSnakeGame({ seed: 4, map: snakeMap('pillars') })
    expect(pillars.snake).toEqual(classic.snake)
    expect(['loop', 'shortcut']).toContain(createSnakeAi().decide(classic).strategy)

    expect(['path', 'survive']).toContain(createSnakeAi().decide(pillars).strategy)
  })

  it.each(SNAKE_MAPS.flatMap((map) => [1, 2, 3].map((seed) => [map.id, seed] as const)))(
    '%s, seed %i: never moves into a wall, never dies, never uses the loop',
    (id, seed) => {
      const ai = createSnakeAi()
      let state = createSnakeGame({ seed, map: snakeMap(id) })
      while (state.status === 'playing' && state.steps < 3000) {
        const decision = ai.decide(state)
        expect(legalMoves(state)).toContain(decision.action)
        expect(isWall(state, step(state.snake[0], decision.action))).toBe(false)
        expect(['path', 'survive']).toContain(decision.strategy)
        state = updateSnake(updateSnake(state, { type: 'turn', direction: decision.action }), { type: 'tick' })
      }

      expect(state.status).not.toBe('over')
      // Not a promise to clear the map, just a floor well under what it reaches (66 to 152 apples).
      expect(state.score).toBeGreaterThanOrEqual(50)
    },
  )

  // Seeds that used to stall: the snake circled a loop its own body walled off from the food and never
  // ate again (39, 22 and 31 apples, then nothing for over 2500 steps). It must keep eating now.
  it.each([
    ['pillars', 4],
    ['tunnels', 19],
    ['rooms', 10],
  ] as const)('%s, seed %i: keeps eating instead of circling a loop', (id, seed) => {
    const ai = createSnakeAi()
    let state = createSnakeGame({ seed, map: snakeMap(id) })
    let lastApple = 0
    let longestWait = 0
    while (state.status === 'playing' && state.steps < 3000) {
      const move = ai.getNextAction(state)
      expect(legalMoves(state)).toContain(move)
      const before = state.score
      state = updateSnake(updateSnake(state, { type: 'turn', direction: move }), { type: 'tick' })
      if (state.score > before) {
        longestWait = Math.max(longestWait, state.steps - lastApple)
        lastApple = state.steps
      }
    }
    longestWait = Math.max(longestWait, state.steps - lastApple)

    expect(state.status).toBe('playing')
    expect(state.score).toBeGreaterThanOrEqual(100) // reaches 130 to 142
    expect(longestWait).toBeLessThan(1000) // at most 277 steps between apples
  })

  it('stays deterministic on maps: the same game always plays the same moves', () => {
    const play = () => {
      const ai = createSnakeAi()
      let state = createSnakeGame({ seed: 10, map: snakeMap('rooms') })
      let moves = ''
      while (state.steps < 1500) {
        const move = ai.getNextAction(state)
        moves += move[0]
        state = updateSnake(updateSnake(state, { type: 'turn', direction: move }), { type: 'tick' })
      }
      return moves
    }

    expect(play()).toBe(play())
  })
})
