import { describe, expect, it } from 'vitest'
import {
  createSnakeGame,
  legalMoves,
  snakeLevel,
  tickDelay,
  updateSnake,
  type Direction,
  type Point,
  type SnakeState,
} from './snakeEngine'

/** Builds a state by hand so each test controls the exact position. */
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

const tick = (state: SnakeState) => updateSnake(state, { type: 'tick' })
const turn = (state: SnakeState, direction: Direction) => updateSnake(state, { type: 'turn', direction })

describe('createSnakeGame', () => {
  it('starts with a three-cell snake heading right and food on a free cell', () => {
    const state = createSnakeGame({ seed: 42 })

    expect(state.snake).toEqual([
      { x: 8, y: 8 },
      { x: 7, y: 8 },
      { x: 6, y: 8 },
    ])
    expect(state.direction).toBe('RIGHT')
    expect(state.status).toBe('playing')
    expect(state.snake).not.toContainEqual(state.food)
  })

  it('is deterministic for a given seed', () => {
    expect(createSnakeGame({ seed: 7 })).toEqual(createSnakeGame({ seed: 7 }))
    expect(createSnakeGame({ seed: 7 }).food).not.toEqual(createSnakeGame({ seed: 8 }).food)
  })
})

describe('movement', () => {
  it('moves one cell per tick in the current direction', () => {
    const state = tick(stateOf({ snake: [{ x: 2, y: 2 }, { x: 1, y: 2 }] }))

    expect(state.snake).toEqual([{ x: 3, y: 2 }, { x: 2, y: 2 }])
    expect(state.steps).toBe(1)
  })

  it('does not mutate the previous state', () => {
    const before = stateOf({ snake: [{ x: 2, y: 2 }, { x: 1, y: 2 }] })
    const snapshot = structuredClone(before)
    tick(turn(before, 'UP'))

    expect(before).toEqual(snapshot)
  })

  it('applies a turn on the next tick', () => {
    const state = tick(turn(stateOf({ snake: [{ x: 2, y: 2 }, { x: 1, y: 2 }] }), 'UP'))

    expect(state.snake[0]).toEqual({ x: 2, y: 1 })
    expect(state.direction).toBe('UP')
  })

  it('ignores a turn straight back into the body', () => {
    const before = stateOf({ snake: [{ x: 2, y: 2 }, { x: 1, y: 2 }] })

    expect(turn(before, 'LEFT')).toBe(before)
  })

  it('queues two quick turns and applies them on consecutive ticks', () => {
    let state = stateOf({ snake: [{ x: 2, y: 2 }, { x: 1, y: 2 }] })
    state = turn(turn(state, 'UP'), 'LEFT')

    state = tick(state)
    expect(state.snake[0]).toEqual({ x: 2, y: 1 })
    state = tick(state)
    expect(state.snake[0]).toEqual({ x: 1, y: 1 })
  })
})

describe('food', () => {
  it('grows by one, scores and respawns food on a free cell', () => {
    const state = tick(stateOf({ snake: [{ x: 2, y: 2 }, { x: 1, y: 2 }], food: { x: 3, y: 2 } }))

    expect(state.snake).toEqual([{ x: 3, y: 2 }, { x: 2, y: 2 }, { x: 1, y: 2 }])
    expect(state.score).toBe(1)
    expect(state.food).not.toBeNull()
    expect(state.snake).not.toContainEqual(state.food)
  })

  it('wins when the snake fills the board', () => {
    // 2x2 board, snake on three cells, food on the last one.
    const state = tick(
      stateOf({
        width: 2,
        height: 2,
        snake: [{ x: 0, y: 1 }, { x: 0, y: 0 }, { x: 1, y: 0 }],
        direction: 'DOWN',
        turnQueue: ['RIGHT'],
        food: { x: 1, y: 1 },
      }),
    )

    expect(state.status).toBe('won')
    expect(state.food).toBeNull()
    expect(state.snake).toHaveLength(4)
  })
})

describe('collisions', () => {
  it('ends the game when hitting a wall', () => {
    const state = tick(stateOf({ snake: [{ x: 5, y: 2 }, { x: 4, y: 2 }] }))

    expect(state.status).toBe('over')
  })

  it('ends the game when hitting the body', () => {
    // Head at (2,2) moving up into (2,1), which is part of the body.
    const snake = [{ x: 2, y: 2 }, { x: 3, y: 2 }, { x: 3, y: 1 }, { x: 2, y: 1 }, { x: 1, y: 1 }, { x: 1, y: 2 }]
    const state = tick(stateOf({ snake, direction: 'LEFT', turnQueue: ['UP'] }))

    expect(state.status).toBe('over')
  })

  it('allows moving onto the cell the tail is leaving', () => {
    // A 2x2 loop: the head follows the tail around.
    const snake = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }]
    const state = tick(stateOf({ snake, direction: 'LEFT', turnQueue: ['DOWN'] }))

    expect(state.status).toBe('playing')
    expect(state.snake[0]).toEqual({ x: 0, y: 1 })
  })

  it('ignores every action once the game is over', () => {
    const over = tick(stateOf({ snake: [{ x: 5, y: 2 }, { x: 4, y: 2 }] }))

    expect(tick(over)).toBe(over)
    expect(turn(over, 'UP')).toBe(over)
  })
})

describe('legalMoves', () => {
  it('excludes walls, the body and reversing', () => {
    // Head in the top-right corner heading right: only DOWN is survivable.
    const state = stateOf({ snake: [{ x: 5, y: 0 }, { x: 4, y: 0 }, { x: 3, y: 0 }] })

    expect(legalMoves(state)).toEqual(['DOWN'])
  })

  it('returns nothing when the snake is boxed in', () => {
    const snake = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }, { x: 0, y: 2 }]
    const state = stateOf({ snake, direction: 'LEFT' })

    expect(legalMoves(state)).toEqual([])
  })
})

describe('restart', () => {
  it('a new game after game over is fresh and playable again', () => {
    const over = tick(stateOf({ snake: [{ x: 5, y: 2 }, { x: 4, y: 2 }], score: 7, steps: 40 }))
    expect(over.status).toBe('over')

    const restarted = createSnakeGame({ seed: over.seed })

    expect(restarted).toMatchObject({ status: 'playing', score: 0, steps: 0, direction: 'RIGHT', turnQueue: [] })
    expect(restarted.snake).toHaveLength(3)
    expect(tick(restarted).steps).toBe(1)
  })
})

describe('difficulty', () => {
  it('goes up one level every five apples', () => {
    expect(snakeLevel(0)).toBe(1)
    expect(snakeLevel(4)).toBe(1)
    expect(snakeLevel(5)).toBe(2)
    expect(snakeLevel(23)).toBe(5)
  })

  it('shortens the delay between steps as the level rises', () => {
    expect(tickDelay(0)).toBe(150)
    expect(tickDelay(5)).toBeLessThan(tickDelay(4))
    expect(tickDelay(10)).toBeLessThan(tickDelay(5))
  })

  it('never gets faster than the minimum delay', () => {
    expect(tickDelay(40)).toBe(70)
    expect(tickDelay(253)).toBe(70)
  })
})
