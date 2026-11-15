import { describe, expect, it } from 'vitest'
import { createSnakeAi } from '../ai/snakeAi'
import { ADVENTURE_STAGES, adventureStage, createAdventureGame, type AdventureStage } from './snakeAdventure'
import {
  adventureOutcome,
  createSnakeGame,
  legalMoves,
  movesLeft,
  samePoint,
  updateSnake,
  type Direction,
  type Point,
  type SnakeState,
} from './snakeEngine'
import { snakeMap } from './snakeMaps'

const tick = (state: SnakeState) => updateSnake(state, { type: 'tick' })
const turn = (state: SnakeState, direction: Direction) => updateSnake(state, { type: 'turn', direction })
const move = (state: SnakeState, direction: Direction) => tick(turn(state, direction))

/** A hand-built position on a small open board. */
function stateOf(overrides: Partial<SnakeState> & { snake: Point[] }): SnakeState {
  return {
    width: 8,
    height: 8,
    direction: 'RIGHT',
    turnQueue: [],
    food: { x: 7, y: 7 },
    score: 0,
    steps: 0,
    status: 'playing',
    seed: 1,
    ...overrides,
  }
}

/** A snake heading right along row 2, head at column 3. */
const ROW = [
  { x: 3, y: 2 },
  { x: 2, y: 2 },
  { x: 1, y: 2 },
]

/** Plays the game with the AI through the real engine, counting moves that were not legal. */
function playWithAi(state: SnakeState, maxSteps = 5000) {
  const ai = createSnakeAi()
  let illegal = 0
  while (state.status === 'playing' && state.steps < maxSteps) {
    const direction = ai.getNextAction(state)
    const legal = legalMoves(state)
    if (legal.length > 0 && !legal.includes(direction)) illegal++
    state = move(state, direction)
  }
  return { state, illegal }
}

describe('the Adventure stages', () => {
  it('are the six approved stages, in order', () => {
    expect(ADVENTURE_STAGES.map(({ id, map, objective }) => ({ id, map, objective }))).toEqual([
      { id: 1, map: null, objective: { apples: 10 } },
      { id: 2, map: 'pillars', objective: { apples: 15 } },
      { id: 3, map: 'tunnels', objective: { apples: 20 } },
      { id: 4, map: 'tunnels', objective: { apples: 15, moveLimit: 400 } },
      { id: 5, map: 'rooms', objective: { apples: 25 } },
      { id: 6, map: 'rooms', objective: { apples: 30, moveLimit: 900 } },
    ])
    expect(adventureStage(4)).toBe(ADVENTURE_STAGES[3])
  })

  it('each have a fixed seed of their own', () => {
    const seeds = ADVENTURE_STAGES.map((stage) => stage.seed)
    expect(new Set(seeds).size).toBe(6)
    seeds.forEach((seed) => expect(Number.isInteger(seed)).toBe(true))
  })

  it('cannot be changed', () => {
    const stage = ADVENTURE_STAGES[0]
    expect(Object.isFrozen(ADVENTURE_STAGES)).toBe(true)
    ADVENTURE_STAGES.forEach((each) => {
      expect(Object.isFrozen(each)).toBe(true)
      expect(Object.isFrozen(each.objective)).toBe(true)
    })
    expect(() => {
      ;(stage as { seed: number }).seed = 1
    }).toThrow(TypeError)
    expect(() => {
      ;(stage.objective as { apples: number }).apples = 1
    }).toThrow(TypeError)
    expect(() => (ADVENTURE_STAGES as AdventureStage[]).push(stage)).toThrow(TypeError)
  })

  it('refuses a stage that does not exist', () => {
    expect(() => adventureStage(7 as never)).toThrow('Unknown Snake Adventure stage 7')
  })
})

describe('an Adventure stage starts', () => {
  it.each(ADVENTURE_STAGES.map((stage) => [stage.id, stage] as const))(
    'stage %i on its board, with its objective, the same way every time',
    (_, stage) => {
      const game = createAdventureGame(stage)

      expect(createAdventureGame(stage)).toEqual(game)
      expect(game).toMatchObject({ width: 16, height: 16, score: 0, steps: 0, status: 'playing', turnQueue: [] })
      expect(game.objective).toEqual(stage.objective)
      expect(movesLeft(game)).toBe(stage.objective.moveLimit ?? null)
      expect(adventureOutcome(game)).toBe('playing')

      // The same board and start as the Classic game or the map without an objective, on the stage's seed.
      const plain = createSnakeGame({ seed: stage.seed, map: stage.map ? snakeMap(stage.map) : undefined })
      const { objective, ...rest } = game
      expect(objective).toBeDefined()
      expect(rest).toEqual(plain)
      if (stage.map) {
        expect(game.walls).toEqual(snakeMap(stage.map).walls)
        expect(game.snake).toEqual(snakeMap(stage.map).start.snake)
        expect(game.direction).toBe(snakeMap(stage.map).start.direction)
      } else {
        expect(game.walls).toBeUndefined()
        expect(game.snake).toEqual([{ x: 8, y: 8 }, { x: 7, y: 8 }, { x: 6, y: 8 }])
        expect(game.direction).toBe('RIGHT')
      }
      expect(game.food).not.toBeNull()
    },
  )

  it('with the first apple fixed by the stage seed', () => {
    expect(ADVENTURE_STAGES.map((stage) => createAdventureGame(stage).food)).toEqual([
      { x: 14, y: 12 },
      { x: 6, y: 3 },
      { x: 1, y: 13 },
      { x: 1, y: 15 },
      { x: 14, y: 0 },
      { x: 3, y: 9 },
    ])
  })
})

describe('the objective', () => {
  it('is reached on the move that eats its last apple, which ends the stage at once', () => {
    const before = stateOf({ snake: ROW, food: { x: 4, y: 2 }, score: 2, objective: { apples: 3 } })

    const after = tick(before)

    expect(after).toMatchObject({ status: 'won', score: 3, steps: 1, food: null, seed: before.seed })
    expect(after.snake).toHaveLength(4)
    expect(adventureOutcome(after)).toBe('cleared')
    // Nothing moves any more.
    expect(tick(after)).toBe(after)
  })

  it('is not reached one apple short', () => {
    const after = tick(stateOf({ snake: ROW, food: { x: 4, y: 2 }, score: 1, objective: { apples: 3 } }))

    expect(after).toMatchObject({ status: 'playing', score: 2 })
    expect(after.food).not.toBeNull()
    expect(adventureOutcome(after)).toBe('playing')
  })

  it('counts every apple of a real stage exactly, and ends on the last one', () => {
    const stage = adventureStage(1)
    let state = createAdventureGame(stage)
    const ai = createSnakeAi()
    const scores: number[] = []
    while (state.status === 'playing') {
      const next = move(state, ai.getNextAction(state))
      // Eating grows the snake by one and scores one; nothing else changes the score.
      expect(next.score - state.score).toBe(next.snake.length - state.snake.length)
      if (next.score !== state.score) scores.push(next.score)
      state = next
    }

    expect(scores).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    expect(state).toMatchObject({ status: 'won', score: 10, food: null })
    expect(state.snake).toHaveLength(13)
  })
})

describe('the move limit', () => {
  const limited = (steps: number, overrides: Partial<Omit<SnakeState, 'snake'>> = {}) =>
    stateOf({ snake: ROW, steps, objective: { apples: 5, moveLimit: 10 }, ...overrides })

  it('counts each move made', () => {
    let state = limited(0)
    for (let made = 1; made <= 3; made++) {
      state = tick(state)
      expect(state.steps).toBe(made)
      expect(movesLeft(state)).toBe(10 - made)
    }
  })

  it('leaves the stage open with one move left', () => {
    const state = tick(limited(8))

    expect(state).toMatchObject({ steps: 9, status: 'playing' })
    expect(movesLeft(state)).toBe(1)
  })

  it('fails the stage when its last move is used without reaching the objective', () => {
    const state = tick(limited(9))

    expect(state).toMatchObject({ steps: 10, status: 'over' })
    expect(movesLeft(state)).toBe(0)
    expect(adventureOutcome(state)).toBe('out-of-moves')
    expect(tick(state)).toBe(state)
  })

  it('fails it on the last move even when that move eats an apple short of the objective', () => {
    const state = tick(limited(9, { food: { x: 4, y: 2 }, score: 3 }))

    expect(state).toMatchObject({ steps: 10, score: 4, status: 'over' })
    expect(adventureOutcome(state)).toBe('out-of-moves')
  })

  it('clears the stage when the last allowed move eats the last apple', () => {
    const state = tick(limited(9, { food: { x: 4, y: 2 }, score: 4 }))

    expect(state).toMatchObject({ steps: 10, score: 5, status: 'won' })
    expect(adventureOutcome(state)).toBe('cleared')
  })

  it('does not exist for a stage without one', () => {
    const state = tick(stateOf({ snake: ROW, steps: 5000, objective: { apples: 5 } }))

    expect(state.status).toBe('playing')
    expect(movesLeft(state)).toBeNull()
  })

  it('runs out on a real stage after exactly its number of moves', () => {
    // Circling in a 2x2 square never eats on stage 4's board (its first apple is elsewhere).
    let state = createAdventureGame(adventureStage(4))
    const square: Direction[] = ['DOWN', 'LEFT', 'UP', 'RIGHT']
    let moves = 0
    while (state.status === 'playing') {
      state = move(state, square[moves % 4])
      moves++
    }

    expect(moves).toBe(400)
    expect(state).toMatchObject({ steps: 400, score: 0, status: 'over' })
    expect(adventureOutcome(state)).toBe('out-of-moves')
  })
})

describe('a stage failed by a collision', () => {
  it('ends when the snake runs into a wall, and the fatal move is not counted', () => {
    // Stage 2, Pillars: down three, then right into the pillar at column 11, row 11.
    let state = createAdventureGame(adventureStage(2))
    for (const direction of ['DOWN', 'DOWN', 'DOWN', 'RIGHT', 'RIGHT'] as const) state = move(state, direction)
    expect(state).toMatchObject({ status: 'playing', steps: 5 })
    expect(state.snake[0]).toEqual({ x: 10, y: 11 })

    state = tick(state)

    expect(state).toMatchObject({ status: 'over', steps: 5 })
    expect(adventureOutcome(state)).toBe('collision')
  })

  it('ends when the snake runs into the board edge', () => {
    let state = createAdventureGame(adventureStage(5))
    // Rooms starts at row 3: up three moves to the top row, then off the board.
    for (let index = 0; index < 4; index++) state = move(state, 'UP')

    expect(state).toMatchObject({ status: 'over', steps: 3 })
    expect(adventureOutcome(state)).toBe('collision')
  })

  it('ends when the snake runs into itself, even with moves to spare', () => {
    const snake = [
      { x: 3, y: 3 },
      { x: 3, y: 2 },
      { x: 2, y: 2 },
      { x: 2, y: 3 },
      { x: 2, y: 4 },
    ]
    const state = tick(turn(stateOf({ snake, direction: 'DOWN', steps: 3, objective: { apples: 5, moveLimit: 10 } }), 'LEFT'))

    expect(state).toMatchObject({ status: 'over', steps: 3 })
    expect(movesLeft(state)).toBe(7)
    expect(adventureOutcome(state)).toBe('collision')
  })
})

describe('a fixed seed', () => {
  it.each(ADVENTURE_STAGES.map((stage) => [stage.id, stage] as const))(
    'replays stage %i identically for the same moves',
    (_, stage) => {
      const first = playWithAi(createAdventureGame(stage)).state
      const second = playWithAi(createAdventureGame(stage)).state

      expect(second).toEqual(first)
    },
  )

  it('puts every apple on a free cell reachable on the map', () => {
    let state = createAdventureGame(adventureStage(6))
    const ai = createSnakeAi()
    while (state.status === 'playing') {
      const { food, walls = [] } = state
      if (food) {
        expect(walls.some((wall) => samePoint(wall, food))).toBe(false)
        expect(state.snake.some((part) => samePoint(part, food))).toBe(false)
      }
      state = move(state, ai.getNextAction(state))
    }
  })
})

describe('the AI on Adventure stages', () => {
  /** Moves the AI took to clear each stage on its fixed seed (the AI is deterministic). */
  const CLEARED_IN: Record<number, number> = { 1: 178, 2: 179, 3: 172, 4: 263, 5: 362, 6: 425 }

  it.each(ADVENTURE_STAGES.map((stage) => [stage.id, stage] as const))(
    'plays stage %i legally and clears it on its seed',
    (_, stage) => {
      const { state, illegal } = playWithAi(createAdventureGame(stage))

      expect(illegal).toBe(0)
      expect(adventureOutcome(state)).toBe('cleared')
      expect(state.score).toBe(stage.objective.apples)
      expect(state.steps).toBe(CLEARED_IN[stage.id])
      if (stage.objective.moveLimit) expect(state.steps).toBeLessThanOrEqual(stage.objective.moveLimit)
    },
  )

  it.each(ADVENTURE_STAGES.map((stage) => [stage.id, stage] as const))(
    'plays stage %i legally on other seeds too',
    (_, stage) => {
      for (let seed = 1; seed <= 10; seed++) {
        const game = createSnakeGame({ seed, map: stage.map ? snakeMap(stage.map) : undefined, objective: stage.objective })
        const { state, illegal } = playWithAi(game)

        expect(illegal).toBe(0)
        expect(adventureOutcome(state)).toBe('cleared')
      }
    },
  )
})

describe('Classic and Maps without an objective', () => {
  it('never carry one, and never end on apples or moves', () => {
    for (const map of [undefined, snakeMap('pillars'), snakeMap('tunnels'), snakeMap('rooms')]) {
      const start = createSnakeGame({ seed: 7, map })
      expect('objective' in start).toBe(false)
      expect(movesLeft(start)).toBeNull()
      expect(adventureOutcome(start)).toBeNull()

      const { state } = playWithAi(start, 1200)
      expect(state.status).toBe('playing')
      expect(state.steps).toBe(1200)
      expect(state.score).toBeGreaterThan(30)
      expect('objective' in state).toBe(false)
      expect(adventureOutcome(state)).toBeNull()
    }
  })
})
