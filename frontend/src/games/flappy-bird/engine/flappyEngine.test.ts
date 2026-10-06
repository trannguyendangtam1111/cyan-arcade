import { describe, expect, it } from 'vitest'
import type { FlappyState, PipePair } from '../types/flappyTypes'
import { circleHitsRect, hitsPipe } from './collision'
import { COURSE, DIFFICULTY, difficultyFor, levelFor, passTimeMs } from './difficulty'
import {
  advance,
  BIRD_START_Y,
  BIRD_X,
  crashAt,
  createFlappyEngine,
  createFlappyGame,
  flap,
  isGameOver,
  PHYSICS,
  runDetails,
  scoreOf,
  STEP_MS,
  stepBird,
  updateFlappy,
  WORLD,
} from './flappyEngine'

const DT = STEP_MS / 1000
const SEED = 2026

/** A flight in progress, with the bird and pipes set up by the test. */
function flying(overrides: Partial<FlappyState> = {}): FlappyState {
  return { ...flap(createFlappyGame(SEED)), ...overrides }
}

const pipe = (overrides: Partial<PipePair> = {}): PipePair => ({
  id: 0,
  x: BIRD_X - 35,
  gapY: 300,
  gapHeight: 160,
  width: 70,
  passed: false,
  ...overrides,
})

/**
 * Keeps the bird at the height of the next gap's centre by flapping whenever it sinks below it:
 * a simple but reliable pilot for tests about everything but flying well.
 */
function pilot(state: Readonly<FlappyState>): boolean {
  const next = state.pipes.find((candidate) => candidate.x + candidate.width > BIRD_X - PHYSICS.birdRadius)
  const target = next && next.x < BIRD_X + 200 ? next.gapY + 10 : 280
  return state.bird.y > target && state.bird.vy > -100
}

describe('a new flight', () => {
  it('waits for the first flap, with the first pipe off to the right', () => {
    const state = createFlappyGame(SEED)
    expect(state.status).toBe('ready')
    expect(state.bird).toEqual({ y: BIRD_START_Y, vy: 0 })
    expect(state.score).toBe(0)
    expect(state.pipes).toHaveLength(1)
    expect(state.pipes[0]).toMatchObject({ id: 0, x: COURSE.firstPipeX, width: COURSE.pipeWidth, passed: false })
    expect(state.pipes[0].x).toBeGreaterThan(WORLD.width)
  })

  it('does not move before the first flap', () => {
    const state = createFlappyGame(SEED)
    expect(advance(state, 1000)).toBe(state)
    expect(updateFlappy(state, { type: 'tick', ms: 500 })).toBe(state)
  })

  it('starts with the first flap, which counts', () => {
    const state = flap(createFlappyGame(SEED))
    expect(state.status).toBe('playing')
    expect(state.flaps).toBe(1)
    expect(state.bird.vy).toBe(PHYSICS.flapVelocity)
  })
})

describe('physics', () => {
  it('gravity pulls the bird down a little more every step', () => {
    const start = flying({ bird: { y: 300, vy: 0 } })
    const one = advance(start, STEP_MS)
    expect(one.bird.vy).toBeCloseTo(PHYSICS.gravity * DT)
    expect(one.bird.y).toBeCloseTo(300 + PHYSICS.gravity * DT * DT)
    const two = advance(one, STEP_MS)
    expect(two.bird.vy).toBeCloseTo(2 * PHYSICS.gravity * DT)
    expect(two.bird.y - one.bird.y).toBeGreaterThan(one.bird.y - start.bird.y)
  })

  it('a flap sets the same upward speed whatever the bird was doing', () => {
    for (const vy of [-300, 0, 650]) {
      const state = flap(flying({ bird: { y: 300, vy } }))
      expect(state.bird.vy).toBe(PHYSICS.flapVelocity)
      expect(advance(state, STEP_MS).bird.y).toBeLessThan(300)
    }
  })

  it('falls no faster than the top speed', () => {
    const state = advance(flying({ bird: { y: 40, vy: 0 }, pipes: [] }), 600)
    expect(state.bird.vy).toBeLessThanOrEqual(PHYSICS.maxFallSpeed)
    expect(stepBird({ y: 0, vy: PHYSICS.maxFallSpeed }, false).vy).toBe(PHYSICS.maxFallSpeed)
  })

  it('a flap rises and then falls back, the same arc every time', () => {
    let state = flying({ bird: { y: 400, vy: 0 }, pipes: [] })
    state = flap(state)
    const heights: number[] = []
    for (let i = 0; i < 40; i++) {
      state = advance(state, STEP_MS)
      heights.push(state.bird.y)
    }
    const apex = Math.min(...heights)
    // vy² / 2g, give or take the discrete steps.
    expect(400 - apex).toBeCloseTo(PHYSICS.flapVelocity ** 2 / (2 * PHYSICS.gravity), -1)
    expect(heights.at(-1)).toBeGreaterThan(apex)
  })

  /** The bird's height at every step of two seconds of flight, flapping at fixed steps, with time cut into `frames`. */
  const heightsWith = (frames: number[]) => {
    const heights: number[] = []
    let state = flying()
    for (let i = 0; state.status === 'playing' && state.steps < 240; i++) {
      state = advance(state, frames[i % frames.length], (current) => {
        heights[current.steps] = current.bird.y
        return current.steps % 75 === 0
      })
    }
    expect(state.status).toBe('playing')
    return heights.slice(0, 230)
  }

  it('flies exactly the same at 30, 60 and 144 frames a second', () => {
    const at60 = heightsWith([1000 / 60])
    expect(heightsWith([1000 / 30])).toEqual(at60)
    expect(heightsWith([1000 / 144])).toEqual(at60)
  })

  it('flies exactly the same however unevenly the frames come', () => {
    expect(heightsWith([3, 17, 9.5, 33, 1, 25])).toEqual(heightsWith([STEP_MS]))
  })

  it('keeps game time in step with real time', () => {
    let state = flying({ bird: { y: 200, vy: 0 }, pipes: [] })
    for (let i = 0; i < 30; i++) {
      state = advance(state, 1000 / 30)
      if (state.bird.y > 250) state = flap(state)
    }
    expect(state.status).toBe('playing')
    expect(state.elapsedMs).toBeGreaterThan(1000 - STEP_MS - 0.001)
    expect(state.elapsedMs).toBeLessThanOrEqual(1000 + 0.001)
  })

  it('never simulates more than a second at once', () => {
    const state = advance(flying({ bird: { y: 100, vy: 0 }, pipes: [] }), 60_000)
    expect(state.elapsedMs).toBeLessThanOrEqual(1000)
  })
})

describe('the course', () => {
  it('is the same for the same seed and different for another', () => {
    const course = (seed: number) => {
      let state = flap(createFlappyGame(seed))
      const gaps = new Map<number, number>()
      while (state.status === 'playing' && state.nextPipeId < 12) {
        state = advance(state, 100, pilot)
        for (const each of state.pipes) gaps.set(each.id, each.gapY)
      }
      return [...gaps.entries()]
    }
    expect(course(7)).toEqual(course(7))
    expect(course(7)).not.toEqual(course(8))
  })

  it('makes every gap fit the playfield and within reach of the one before', () => {
    let state = flap(createFlappyGame(99))
    const seen = new Map<number, PipePair>()
    while (state.status === 'playing' && state.score < 40) {
      state = advance(state, 100, pilot)
      for (const each of state.pipes) seen.set(each.id, each)
    }
    const pipes = [...seen.values()].sort((a, b) => a.id - b.id)
    expect(pipes.length).toBeGreaterThan(10)
    pipes.forEach((each, index) => {
      const level = difficultyFor(each.id)
      expect(each.gapHeight).toBe(level.gapHeight)
      expect(each.gapY - each.gapHeight / 2).toBeGreaterThanOrEqual(60)
      expect(each.gapY + each.gapHeight / 2).toBeLessThanOrEqual(WORLD.groundY - 60)
      if (index > 0) expect(Math.abs(each.gapY - pipes[index - 1].gapY)).toBeLessThanOrEqual(level.maxGapShift)
    })
  })

  it('needs no randomness from outside the state', () => {
    const one = createFlappyGame(5)
    const two = createFlappyGame(5)
    expect(one).toEqual(two)
    expect(one.initialSeed).toBe(5)
    // Seeds are 31-bit, so they fit the whole numbers a run reports.
    expect(createFlappyGame(0xffffffff).initialSeed).toBeLessThanOrEqual(0x7fffffff)
  })
})

describe('scoring', () => {
  it('scores once when a pipe is entirely behind the bird, and never again for it', () => {
    let state = flying({ bird: { y: 300, vy: 0 }, pipes: [pipe({ x: BIRD_X - 69, gapY: 300 })] })
    state = advance(state, STEP_MS * 2)
    expect(state.score).toBe(1)
    expect(state.pipes[0].passed).toBe(true)
    state = advance(flap(state), STEP_MS * 10)
    expect(state.score).toBe(1)
  })

  it('passes pipes when the course says it does', () => {
    let state = flying()
    const passes: number[] = []
    while (state.status === 'playing' && state.score < 20) {
      const before = state.score
      state = advance(state, STEP_MS, pilot)
      if (state.score > before) passes.push(state.elapsedMs)
    }
    expect(passes).toHaveLength(20)
    passes.forEach((ms, index) => {
      // Noticed at the end of the step that passes it: never early, at most a step or two late.
      expect(ms).toBeGreaterThanOrEqual(passTimeMs(index) - 0.001)
      expect(ms - passTimeMs(index)).toBeLessThan(STEP_MS * 2)
    })
  })

  it('reports a run as a few whole numbers', () => {
    let state = flying()
    while (state.status === 'playing' && state.score < 6) state = advance(state, 50, pilot)
    state = advance(state, 5000)
    expect(state.status).toBe('over')
    const details = runDetails(state)
    expect(details).toEqual({
      pipes: state.score,
      flaps: state.flaps,
      flightMs: Math.round(state.elapsedMs),
      seconds: Math.floor(Math.round(state.elapsedMs) / 1000),
      level: levelFor(state.score),
      seed: SEED,
    })
    for (const value of Object.values(details)) expect(Number.isInteger(value) && value >= 0).toBe(true)
  })
})

describe('collisions', () => {
  it('a circle touching a rectangle hits it; one just clear does not', () => {
    const rect = { left: 100, right: 170, top: 0, bottom: 200 }
    expect(circleHitsRect(130, 210, 10, rect)).toBe(true) // exactly touching the bottom edge
    expect(circleHitsRect(130, 210.01, 10, rect)).toBe(false)
    expect(circleHitsRect(90, 100, 10, rect)).toBe(true) // the left edge
    expect(circleHitsRect(89.9, 100, 10, rect)).toBe(false)
    // Near a corner, it is the distance to the corner that counts.
    expect(circleHitsRect(93, 207, 10, rect)).toBe(true)
    expect(circleHitsRect(92, 208, 10, rect)).toBe(false)
    expect(circleHitsRect(130, 100, 10, rect)).toBe(true) // inside
  })

  it('the bird fits through the middle of a gap but not past its edges', () => {
    const gap = pipe({ gapY: 300, gapHeight: 160 })
    const r = PHYSICS.birdRadius
    expect(hitsPipe(BIRD_X, 300, r, gap)).toBe(false)
    expect(hitsPipe(BIRD_X, 300 - 80 + r + 0.5, r, gap)).toBe(false)
    expect(hitsPipe(BIRD_X, 300 - 80 + r - 0.5, r, gap)).toBe(true) // the upper pipe
    expect(hitsPipe(BIRD_X, 300 + 80 - r + 0.5, r, gap)).toBe(true) // the lower pipe
    expect(hitsPipe(BIRD_X, 100, r, pipe({ x: BIRD_X + r + 1 }))).toBe(false) // not there yet
    expect(hitsPipe(BIRD_X, 100, r, pipe({ x: BIRD_X + r - 1 }))).toBe(true)
    // The AI's safety margin makes the bird bigger.
    expect(hitsPipe(BIRD_X, 300 - 80 + r + 0.5, r, gap, 0, 2)).toBe(true)
  })

  it('crashing into a pipe, the ground or the ceiling ends the flight', () => {
    const intoPipe = advance(flying({ bird: { y: 150, vy: 0 }, pipes: [pipe({ gapY: 400 })] }), STEP_MS)
    expect(intoPipe.status).toBe('over')
    expect(intoPipe.crash).toBe('pipe')

    const intoGround = advance(flying({ bird: { y: WORLD.groundY - 20, vy: 600 }, pipes: [] }), 200)
    expect(intoGround.crash).toBe('ground')
    // Left lying on the ground, not under it.
    expect(intoGround.bird.y).toBe(WORLD.groundY - PHYSICS.birdRadius)

    const intoCeiling = advance(flying({ bird: { y: 20, vy: -470 }, pipes: [] }), 100)
    expect(intoCeiling.crash).toBe('ceiling')
    expect(crashAt(300, [])).toBeNull()
  })

  describe('right at a pipe', () => {
    const r = PHYSICS.birdRadius
    // A gap from 225 to 375; the bird is level with the pipe.
    const inGap = pipe({ x: BIRD_X - 35, gapY: 300, gapHeight: 150 })
    /** A pipe whose face is `gap` units in front of the bird. */
    const ahead = (gap: number) => pipe({ x: BIRD_X + r + gap, gapY: 400, gapHeight: 150 })

    it('just outside a pipe, the bird flies on', () => {
      expect(crashAt(200, [ahead(0.01)])).toBeNull()
      expect(crashAt(225 + r + 0.01, [inGap])).toBeNull()
      expect(crashAt(375 - r - 0.01, [inGap])).toBeNull()
    })

    it('exactly touching a pipe is a crash', () => {
      expect(crashAt(200, [ahead(0)])).toBe('pipe')
      expect(crashAt(225 + r, [inGap])).toBe('pipe')
      expect(crashAt(375 - r, [inGap])).toBe('pipe')
    })

    it('slightly into a pipe is a crash', () => {
      expect(crashAt(200, [ahead(-0.01)])).toBe('pipe')
      expect(crashAt(225 + r - 0.01, [inGap])).toBe('pipe')
      expect(crashAt(375 - r + 0.01, [inGap])).toBe('pipe')
    })

    it('clearly inside the gap, the bird flies on', () => {
      for (const y of [260, 300, 340]) expect(crashAt(y, [inGap])).toBeNull()
    })

    it('touching the upper pipe in flight ends it there', () => {
      // Rising into the top of the gap.
      let state = flying({ bird: { y: 245, vy: -300 }, pipes: [inGap] })
      while (state.status === 'playing' && state.steps < 60) state = advance(state, STEP_MS)
      expect(state.crash).toBe('pipe')
      expect(state.bird.y).toBeLessThanOrEqual(225 + r)
      expect(state.bird.y).toBeGreaterThan(225 + r - 6) // no deeper than one step's movement
    })

    it('touching the lower pipe in flight ends it there', () => {
      let state = flying({ bird: { y: 340, vy: 200 }, pipes: [inGap] })
      while (state.status === 'playing' && state.steps < 60) state = advance(state, STEP_MS)
      expect(state.crash).toBe('pipe')
      expect(state.bird.y).toBeGreaterThanOrEqual(375 - r)
      expect(state.bird.y).toBeLessThan(375 - r + 7)
    })

    it('flying into the side of a pipe ends it as it touches', () => {
      let state = flying({ bird: { y: 200, vy: -PHYSICS.gravity * (STEP_MS / 1000) }, pipes: [ahead(3)] })
      while (state.status === 'playing' && state.steps < 60) state = advance(state, STEP_MS)
      expect(state.crash).toBe('pipe')
      const face = state.pipes[0].x
      // The world moves 1.25 units a step at this speed: the crash comes within one step of touching.
      expect(face - BIRD_X).toBeLessThanOrEqual(r)
      expect(face - BIRD_X).toBeGreaterThan(r - 1.3)
    })
  })

  it('stops for good after a crash', () => {
    const over = advance(flying({ bird: { y: WORLD.groundY - 20, vy: 600 }, pipes: [] }), 200)
    expect(isGameOver(over)).toBe(true)
    expect(advance(over, 1000)).toBe(over)
    expect(flap(over)).toBe(over)
    expect(over.pendingMs).toBe(0)
  })

  it('a restart is a brand new flight on the same course', () => {
    let state = flying()
    state = advance(state, 3000)
    expect(state.status).toBe('over')
    expect(createFlappyGame(SEED)).toEqual(createFlappyGame(state.initialSeed))
  })
})

describe('difficulty', () => {
  it('only ever gets harder, and only a little at a time', () => {
    for (let i = 1; i < DIFFICULTY.length; i++) {
      const [before, level] = [DIFFICULTY[i - 1], DIFFICULTY[i]]
      expect(level.level).toBe(before.level + 1)
      expect(level.fromPipe).toBeGreaterThan(before.fromPipe)
      expect(level.speed).toBeGreaterThan(before.speed)
      expect(level.speed / before.speed).toBeLessThan(1.1)
      expect(level.gapHeight).toBeLessThan(before.gapHeight)
      expect(level.spacing).toBeLessThanOrEqual(before.spacing)
    }
  })

  it('starts approachable and stays fair', () => {
    // The first pipes: slow, wide gaps, far apart.
    expect(difficultyFor(0)).toMatchObject({ level: 1, speed: 150, gapHeight: 172 })
    // Even at the end the gap is five birds high.
    expect(DIFFICULTY.at(-1)!.gapHeight).toBeGreaterThanOrEqual(PHYSICS.birdRadius * 2 * 5)
  })

  it('is decided by pipes passed, nothing else', () => {
    expect([0, 4, 5, 14, 15, 29, 30, 49, 50, 74, 75, 99, 100, 5000].map(levelFor)).toEqual([
      1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7,
    ])
  })

  it('times the course exactly as the server does', () => {
    // The same numbers are checked by the server's tests (FlappyBirdRunRulesTests): both sides must agree.
    expect(passTimeMs(0)).toBeCloseTo(2733.333, 2)
    expect(passTimeMs(5)).toBeCloseTo(10950.633, 2)
    expect(passTimeMs(30)).toBeCloseTo(47634.901, 2)
    expect(passTimeMs(100)).toBeCloseTo(130228.283, 2)
  })
})

describe('the engine object', () => {
  it('offers the same flight through methods', () => {
    const engine = createFlappyEngine(SEED)
    expect(engine.getState().status).toBe('ready')
    engine.startGame()
    expect(engine.getState().status).toBe('playing')
    engine.update(STEP_MS * 10 + 0.01)
    expect(engine.getState().steps).toBe(10)
    engine.flap()
    expect(engine.getState().flaps).toBe(2)
    while (!engine.isGameOver()) engine.update(100)
    expect(engine.getScore()).toBe(scoreOf(engine.getState()))
  })
})
