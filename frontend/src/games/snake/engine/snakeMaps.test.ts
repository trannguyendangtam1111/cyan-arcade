import { describe, expect, it } from 'vitest'
import { createGrid, shortestPath } from '../ai/pathfinding'
import { createSnakeAi } from '../ai/snakeAi'
import {
  createSnakeGame,
  freeCells,
  hasWalls,
  legalMoves,
  samePoint,
  updateSnake,
  type Direction,
  type Point,
  type SnakeState,
} from './snakeEngine'
import { SNAKE_MAPS, freeCellCount, mapMaxScore, mapProblems, snakeMap, type SnakeMap } from './snakeMaps'

const tick = (state: SnakeState) => updateSnake(state, { type: 'tick' })
const turn = (state: SnakeState, direction: Direction) =>
  updateSnake(state, { type: 'turn', direction })

/** A hand-built position on a small board with walls. */
function stateOf(overrides: Partial<SnakeState> & { snake: Point[]; walls: Point[] }): SnakeState {
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

const onSnake = (state: SnakeState, cell: Point) => state.snake.some((part) => samePoint(part, cell))
const onWall = (state: SnakeState, cell: Point) => (state.walls ?? []).some((wall) => samePoint(wall, cell))

/** Whether the head can get to `cell` through cells that are neither walls nor body (the tail may be entered). */
function reachableFromHead(state: SnakeState, cell: Point): boolean {
  const grid = createGrid(state.width, state.height, (state.walls ?? []).concat(state.snake.slice(0, -1)))
  return shortestPath(grid, state.snake[0], cell) !== null
}

describe('map layouts', () => {
  it('has the three maps on the standard 16x16 board', () => {
    expect(SNAKE_MAPS.map((map) => [map.id, map.name, map.width, map.height])).toEqual([
      ['pillars', 'Pillars', 16, 16],
      ['tunnels', 'Tunnels', 16, 16],
      ['rooms', 'Rooms', 16, 16],
    ])
  })

  it.each(SNAKE_MAPS.map((map) => [map.id, map] as const))('%s is connected, has no dead ends and a safe start', (_, map) => {
    expect(mapProblems(map)).toEqual([])
  })

  it('counts the free cells and the highest possible score of each map', () => {
    expect(SNAKE_MAPS.map((map) => [map.id, map.walls.length, freeCellCount(map), mapMaxScore(map)])).toEqual([
      ['pillars', 16, 240, 237],
      ['tunnels', 24, 232, 229],
      ['rooms', 44, 212, 209],
    ])
  })

  it('has no duplicate walls and keeps every wall on the board', () => {
    for (const map of SNAKE_MAPS) {
      expect(new Set(map.walls.map((cell) => `${cell.x},${cell.y}`)).size).toBe(map.walls.length)
      expect(map.walls.every((cell) => cell.x >= 0 && cell.y >= 0 && cell.x < map.width && cell.y < map.height)).toBe(true)
    }
  })

  it('looks maps up by id', () => {
    expect(snakeMap('rooms').name).toBe('Rooms')
    expect(() => snakeMap('nope' as never)).toThrow(/Unknown Snake map/)
  })

  describe('validation catches broken layouts', () => {
    const base = snakeMap('pillars')
    const withWalls = (walls: Point[], start = base.start): SnakeMap => ({ ...base, walls, start })

    it('a dead-end pocket', () => {
      // (0,0) can only be left through (1,0).
      expect(mapProblems(withWalls([{ x: 0, y: 1 }]))).toContain('free cell (0, 0) is a dead end')
    })

    it('a region cut off from the rest', () => {
      const ring = [{ x: 2, y: 0 }, { x: 2, y: 1 }, { x: 2, y: 2 }, { x: 0, y: 2 }, { x: 1, y: 2 }]
      expect(mapProblems(withWalls(ring)).some((problem) => problem.startsWith('free cells are split'))).toBe(true)
    })

    it('a start on a wall, or with a wall right ahead', () => {
      expect(mapProblems(withWalls([{ x: 7, y: 8 }]))).toContain('start cell 1 (7, 8) is not free')
      expect(mapProblems(withWalls([{ x: 10, y: 8 }, { x: 10, y: 9 }]))).toContain(
        'no clear space ahead of the start: (10, 8) is blocked',
      )
    })

    it('a start facing back into its own body', () => {
      expect(mapProblems(withWalls([], { ...base.start, direction: 'LEFT' }))).toContain(
        'the start direction points back into the body',
      )
    })
  })
})

describe('starting a map', () => {
  it.each(SNAKE_MAPS.map((map) => [map.id, map] as const))('%s starts from its layout, deterministically', (_, map) => {
    const state = createSnakeGame({ seed: 11, map })

    expect(state).toEqual(createSnakeGame({ seed: 11, map }))
    expect(state).toMatchObject({ width: 16, height: 16, direction: map.start.direction, score: 0, steps: 0, status: 'playing' })
    expect(state.snake).toEqual(map.start.snake)
    expect(state.walls).toEqual(map.walls)
    expect(hasWalls(state)).toBe(true)
    expect(freeCells(state)).toBe(freeCellCount(map))
  })

  it('does not share its arrays with the map definition', () => {
    const map = snakeMap('tunnels')
    const state = createSnakeGame({ seed: 3, map })

    expect(state.walls).not.toBe(map.walls)
    expect(state.snake).not.toBe(map.start.snake)
  })

  it('places the first apple on a free, reachable cell for every seed', () => {
    for (const map of SNAKE_MAPS) {
      for (let seed = 0; seed < 200; seed++) {
        const state = createSnakeGame({ seed, map })
        expect(state.food).not.toBeNull()
        expect(onWall(state, state.food!)).toBe(false)
        expect(onSnake(state, state.food!)).toBe(false)
      }
    }
  })

  it('starts Rooms in the top-left room, facing the door', () => {
    const state = createSnakeGame({ seed: 1, map: snakeMap('rooms') })

    expect(state.snake[0]).toEqual({ x: 4, y: 3 })
    expect(legalMoves(state)).toContain('RIGHT')
  })
})

describe('walls', () => {
  const walls = [{ x: 3, y: 2 }]

  it('end the game when the head runs into one', () => {
    const state = tick(stateOf({ walls, snake: [{ x: 2, y: 2 }, { x: 1, y: 2 }] }))

    expect(state.status).toBe('over')
    expect(state.snake[0]).toEqual({ x: 2, y: 2 })
  })

  it('are never a legal move', () => {
    const state = stateOf({ walls, snake: [{ x: 2, y: 2 }, { x: 1, y: 2 }] })

    expect(legalMoves(state)).toEqual(['UP', 'DOWN'])
  })

  it('stay fatal even with food behind them, and the board edge stays solid (no wrap-around)', () => {
    const intoWall = tick(stateOf({ walls, snake: [{ x: 2, y: 2 }, { x: 1, y: 2 }], food: { x: 4, y: 2 } }))
    const offEdge = tick(stateOf({ walls, snake: [{ x: 5, y: 0 }, { x: 4, y: 0 }] }))

    expect(intoWall.status).toBe('over')
    expect(offEdge.status).toBe('over')
  })
})

describe('food on maps', () => {
  /*
   * A 5x3 board split by a wall and the body:
   *   . . # . .
   *   . . # . .
   *   . . o . .      (2,2) is body, so the right side can only be reached past it
   */
  const splitWalls = [{ x: 2, y: 0 }, { x: 2, y: 1 }]
  const left = ['0,0', '1,0', '0,1', '0,2']

  it('only lands on cells the head can reach right now', () => {
    const seen = new Set<string>()
    for (let seed = 0; seed < 100; seed++) {
      const state = tick(
        turn(
          stateOf({
            width: 5,
            height: 3,
            walls: splitWalls,
            snake: [{ x: 1, y: 2 }, { x: 2, y: 2 }, { x: 3, y: 2 }, { x: 4, y: 2 }],
            direction: 'LEFT',
            food: { x: 1, y: 1 },
            seed,
          }),
          'UP',
        ),
      )
      expect(state.score).toBe(1)
      seen.add(`${state.food!.x},${state.food!.y}`)
    }

    // Never on the sealed-off right side, and spread over the whole reachable left side.
    expect([...seen].sort()).toEqual([...left].sort())
  })

  it('counts cells past the tail as reachable, since the tail moves away first', () => {
    // After eating at (1,1) the body is (1,1) (2,1) (2,2): the right side connects to the head's side
    // only through the tail at (2,2).
    const sides = new Set<string>()
    for (let seed = 0; seed < 100; seed++) {
      const state = tick(
        turn(
          stateOf({
            width: 5,
            height: 3,
            walls: [{ x: 2, y: 0 }],
            snake: [{ x: 2, y: 1 }, { x: 2, y: 2 }],
            direction: 'UP',
            food: { x: 1, y: 1 },
            seed,
          }),
          'LEFT',
        ),
      )
      expect(state.snake).toEqual([{ x: 1, y: 1 }, { x: 2, y: 1 }, { x: 2, y: 2 }])
      expect(onSnake(state, state.food!)).toBe(false)
      sides.add(state.food!.x > 2 ? 'right' : 'left')
    }

    expect(sides).toEqual(new Set(['left', 'right']))
  })

  it('is never on a wall, the body or an unreachable cell during whole AI games', () => {
    for (const map of SNAKE_MAPS) {
      const ai = createSnakeAi()
      let state = createSnakeGame({ seed: 5, map })
      let apples = 0
      while (state.status === 'playing' && state.steps < 1500) {
        const before = state.score
        state = tick(turn(state, ai.getNextAction(state)))
        if (state.score === before || state.food === null) continue
        apples++
        expect(onWall(state, state.food)).toBe(false)
        expect(onSnake(state, state.food)).toBe(false)
        expect(reachableFromHead(state, state.food)).toBe(true)
      }
      expect(apples).toBeGreaterThan(10)
    }
  })

  it('keeps the same seeded apple sequence for the same map and seed', () => {
    const play = () => {
      const ai = createSnakeAi()
      let state = createSnakeGame({ seed: 77, map: snakeMap('tunnels') })
      const apples: string[] = []
      while (state.steps < 800) {
        const before = state.score
        state = tick(turn(state, ai.getNextAction(state)))
        if (state.score !== before && state.food) apples.push(`${state.food.x},${state.food.y}`)
      }
      return apples
    }

    expect(play()).toEqual(play())
  })

  describe('when no free cell is reachable', () => {
    /*
     * A 4x3 board. After eating at (0,1) the snake fills the whole left side and blocks (1,2):
     *   T o # .        T = tail at (0,0), H = head at (0,1)
     *   H o # .
     *   o o . .        (2,2) and the right column are free but out of reach
     */
    const walls = [{ x: 2, y: 0 }, { x: 2, y: 1 }]
    const boxedIn = () =>
      tick(
        turn(
          stateOf({
            width: 4,
            height: 3,
            walls,
            snake: [{ x: 0, y: 2 }, { x: 1, y: 2 }, { x: 1, y: 1 }, { x: 1, y: 0 }, { x: 0, y: 0 }],
            direction: 'LEFT',
            food: { x: 0, y: 1 },
            seed: 1234,
          }),
          'UP',
        ),
      )

    it('leaves the food empty and keeps playing: it is not a win', () => {
      const state = boxedIn()

      expect(state.score).toBe(1)
      expect(state.snake).toHaveLength(6)
      expect(freeCells(state)).toBe(10)
      expect(state.food).toBeNull()
      expect(state.status).toBe('playing')
      expect(state.seed).toBe(1234)
    })

    it('tries again after every move and places food as soon as a cell is reachable', () => {
      let state = boxedIn()

      state = tick(turn(state, 'UP')) // into the old tail cell: still sealed in
      expect(state).toMatchObject({ food: null, status: 'playing', seed: 1234 })
      state = tick(turn(state, 'RIGHT'))
      expect(state).toMatchObject({ food: null, status: 'playing', seed: 1234 })

      // The tail now sits at (1,2), next to the free (2,2): the right side is reachable again.
      state = tick(turn(state, 'DOWN'))
      expect(state.status).toBe('playing')
      expect(state.food).not.toBeNull()
      expect(onWall(state, state.food!)).toBe(false)
      expect(onSnake(state, state.food!)).toBe(false)
      expect(reachableFromHead(state, state.food!)).toBe(true)
      expect(state.seed).not.toBe(1234)
    })

    it('is deterministic', () => {
      const run = () => tick(turn(tick(turn(tick(turn(boxedIn(), 'UP')), 'RIGHT')), 'DOWN'))
      expect(run()).toEqual(run())
    })

    it('still wins only when every free cell is filled', () => {
      // 3x2 board with one wall: four free cells, the snake fills the last one.
      const state = tick(
        turn(
          stateOf({
            width: 3,
            height: 2,
            walls: [{ x: 2, y: 0 }],
            snake: [{ x: 0, y: 1 }, { x: 0, y: 0 }, { x: 1, y: 0 }],
            direction: 'DOWN',
            food: { x: 1, y: 1 },
          }),
          'RIGHT',
        ),
      )
      // (2,1) is still free, so this is not a win yet.
      expect(state).toMatchObject({ status: 'playing', score: 1 })
      expect(state.food).toEqual({ x: 2, y: 1 })

      const won = tick(turn(state, 'RIGHT'))
      expect(won).toMatchObject({ status: 'won', score: 2, food: null })
      expect(won.snake).toHaveLength(freeCells(won))
    })
  })
})
