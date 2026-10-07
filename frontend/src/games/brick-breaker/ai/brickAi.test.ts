import { describe, expect, it } from 'vitest'
import { ARENA, BALL_RADIUS, cellOf, GRID, PADDLE } from '../engine/arena'
import { advance, createBrickBreakerGame, STEP_MS, updateBrickBreaker } from '../engine/brickEngine'
import { MAX_ANGLE } from '../engine/physics'
import type { Ball, Brick, BrickState, Drop } from '../types/brickTypes'
import { aimOffset, createBrickAi, foldX, predictLanding } from './brickAi'

const ai = createBrickAi()
const ball = (x: number, y: number, vx: number, vy: number, id = 1): Ball => ({ id, x, y, vx, vy })
const keeper = (): Brick => {
  const { x, y } = cellOf(0, 0)
  return { id: 0, row: 0, col: 0, x, y, width: GRID.brickWidth, height: GRID.brickHeight, kind: 'normal', hp: 1, maxHp: 1 }
}

function playing(overrides: Partial<BrickState> = {}): BrickState {
  const state = advance(updateBrickBreaker(createBrickBreakerGame(7), { type: 'launch' }), STEP_MS)
  return { ...state, bricks: [keeper()], events: [], ...overrides }
}

/** Where the engine really brings a ball down to the paddle line, with nothing in its way. */
function engineLanding(start: Ball): { x: number; seconds: number } {
  let state = playing({ balls: [start], paddle: { ...playing().paddle, x: 2000, width: 0, target: null } })
  for (let t = 0; t < 10_000; t += STEP_MS) {
    const before = state.balls[0]
    state = advance(state, STEP_MS)
    const after = state.balls[0]
    if (!after || after.y >= PADDLE.y - BALL_RADIUS) {
      if (!after) return { x: before.x, seconds: t / 1000 }
      return { x: after.x, seconds: (t + STEP_MS) / 1000 }
    }
  }
  throw new Error('never landed')
}

describe('trajectory prediction', () => {
  it('folds a straight path back between the walls, like bounces', () => {
    expect(foldX(200)).toBe(200)
    expect(foldX(ARENA.width - BALL_RADIUS + 30)).toBeCloseTo(ARENA.width - BALL_RADIUS - 30)
    expect(foldX(BALL_RADIUS - 30)).toBeCloseTo(BALL_RADIUS + 30)
  })

  it.each([
    ['straight down', ball(200, 300, 0.0001, 300)],
    ['off the right wall', ball(300, 200, 260, 220)],
    ['off both walls', ball(60, 120, -330, 120)],
    ['up to the ceiling and back', ball(150, 400, 120, -300)],
  ])('lands where the engine lands it: %s', (_, start) => {
    const predicted = predictLanding(start)!
    const actual = engineLanding(start)
    expect(predicted.x).toBeCloseTo(actual.x, 0)
    expect(predicted.seconds).toBeCloseTo(actual.seconds, 1)
  })

  it('has nothing to say about a ball below the paddle', () => {
    expect(predictLanding(ball(200, 590, 10, 300))).toBeNull()
  })
})

describe('decisions', () => {
  it('goes under the landing point of the ball', () => {
    const decision = ai.decide(playing({ balls: [ball(300, 250, 150, 250)] }))
    const landing = predictLanding(ball(300, 250, 150, 250))!
    expect(decision.ballId).toBe(1)
    expect(decision.landingX).toBeCloseTo(landing.x)
    expect(Math.abs(decision.targetX - landing.x)).toBeLessThanOrEqual(PADDLE.width / 2)
  })

  it('saves the ball due soonest when there are several', () => {
    const late = ball(60, 150, 50, 200, 1)
    const soon = ball(340, 470, -60, 250, 2)
    const rising = ball(200, 500, 30, -300, 3)
    expect(ai.decide(playing({ balls: [late, soon, rising] })).ballId).toBe(2)
  })

  it('aims the bounce at a brick it can reach', () => {
    const { x, y } = cellOf(3, 8)
    const target: Brick = { ...keeper(), id: 38, row: 3, col: 8, x, y }
    const offset = aimOffset(100, [target])
    // A ball hitting that far along the paddle leaves at the angle pointing at the brick (or its mirror).
    const angle = offset * MAX_ANGLE
    const reaches = (image: number) => Math.abs(100 + Math.tan(angle) * (PADDLE.y - BALL_RADIUS - (y + 8)) - image) < 2
    expect(reaches(x + 18) || reaches(2 * (ARENA.width - BALL_RADIUS) - (x + 18)) || reaches(2 * BALL_RADIUS - (x + 18))).toBe(true)
    expect(Math.abs(offset)).toBeLessThanOrEqual(0.75)
  })

  it('catches a useful power-up when the ball leaves time for it, and not when it does not', () => {
    const lifeAt = (x: number): Drop => ({ id: 9, kind: 'extraLife', x, y: PADDLE.y - 60 })
    const roomy = ai.decide(playing({ balls: [ball(200, 120, 50, 200)], drops: [lifeAt(250)] }))
    expect(roomy.strategy).toBe('catch')
    expect(roomy.catching).toBe('extraLife')
    const tight = ai.decide(playing({ balls: [ball(30, PADDLE.y - 40, -10, 300)], drops: [lifeAt(370)] }))
    expect(tight.strategy).not.toBe('catch')
  })

  it('prefers the most useful of several power-ups', () => {
    const drops: Drop[] = [
      { id: 1, kind: 'doubleScore', x: 200, y: 450 },
      { id: 2, kind: 'multiBall', x: 230, y: 450 },
    ]
    expect(ai.decide(playing({ balls: [ball(200, 100, 40, 150)], drops })).catching).toBe('multiBall')
  })

  it('only ever answers with a paddle position in the arena, and launches only when serving', () => {
    let state = createBrickBreakerGame(11)
    for (let i = 0; i < 60 * 40 && state.phase !== 'over'; i++) {
      const action = ai.getNextAction(state)
      expect(action.aim).toBeGreaterThanOrEqual(0)
      expect(action.aim).toBeLessThanOrEqual(ARENA.width)
      if (action.launch) expect(state.phase).toBe('serving')
      state = advance(state, 1000 / 60, (current) => ai.getNextAction(current))
    }
  })

  it('decides the same for the same state, whoever asks', () => {
    const state = playing({ balls: [ball(120, 300, -200, 180), ball(300, 200, 100, 260, 2)] })
    expect(createBrickAi().decide(state)).toEqual(createBrickAi().decide(state))
  })
})

describe('playing', () => {
  /** The paddle positions the AI asks for, step by step, with game time cut into `frameMs` chunks. */
  const aims = (frameMs: number) => {
    const pilot = createBrickAi()
    let state = createBrickBreakerGame(21)
    const asked: number[] = []
    while (state.steps < 2400 && state.phase !== 'over') {
      state = advance(state, frameMs, (current) => {
        const action = pilot.getNextAction(current)
        if (current.started) asked[current.steps] = action.aim ?? -1
        return action
      })
    }
    return asked.slice(0, 2300)
  }

  it('makes the same decisions at 1x, 2x, 4x and 8x', () => {
    const normal = aims(1000 / 60)
    for (const speed of [2, 4, 8]) expect(aims((1000 / 60) * speed)).toEqual(normal)
  })

  it.each([1, 99, 2024])('clears the first three levels on seed %i without losing a life', (seed) => {
    const pilot = createBrickAi()
    let state = createBrickBreakerGame(seed)
    for (let i = 0; i < 12 * 60 * 60 && state.level <= 3 && state.phase !== 'over'; i++) {
      state = advance(state, 1000 / 60, (current) => pilot.getNextAction(current))
    }
    expect(state.level).toBe(4)
    expect(state.stats.livesLost).toBe(0)
  })

  it('keeps several balls alive at once', () => {
    const pilot = createBrickAi()
    let state = playing({ balls: [ball(100, 200, 150, 250, 1), ball(300, 260, -140, 260, 2), ball(220, 150, 60, 280, 3)] })
    let lostAny = false
    for (let i = 0; i < 4 * 60; i++) {
      const before = state.balls.length
      state = advance(state, 1000 / 60, (current) => pilot.getNextAction(current))
      if (state.balls.length < before && state.phase === 'playing') lostAny = true
    }
    expect(state.lives).toBe(3)
    expect(lostAny).toBe(false)
  })
})
