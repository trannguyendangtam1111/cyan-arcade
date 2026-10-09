import { describe, expect, it } from 'vitest'
import type { DinoState, Obstacle } from '../types/dinoTypes'
import { overlaps } from './collision'
import { LEVELS, levelFor, minGap, SPEED, speedAt, TOP_LEVEL } from './difficulty'
import {
  advance,
  BAT_LIFT,
  courseOf,
  createDinoRun,
  FIRST_OBSTACLE_X,
  obstaclePlaced,
  onGround,
  pressJump,
  runDetails,
  runnerMask,
  runnerPlaced,
  setDuck,
  start,
} from './dinoEngine'
import { AIRTIME_S, JUMP_HEIGHT, MAX_ADVANCE_MS, RUNNER_X, STEP_MS, WORLD } from './physics'
import { BAT_UP, DUCK_A, JUMP, mask, MOUND, PILLAR, RUN_A } from './shapes'

const SEED = 20261009

/** A running state with nothing in the way, or with exactly these obstacles. */
function running(obstacles: Partial<Obstacle>[] = [], distance = 0): DinoState {
  const state = start(createDinoRun(SEED))
  return {
    ...state,
    distance,
    obstacles: obstacles.map((obstacle, id) => ({ id, kind: 'mound', x: 400, lift: 0, count: 1, age: 0, passed: false, ...obstacle })),
    nextObstacleId: obstacles.length,
  }
}

/** Steps with no obstacles at all: the generator is held off by pushing the course far away. */
function alone(): DinoState {
  return running([{ x: 1e9 }])
}

const steps = (n: number) => n * STEP_MS

describe('the run', () => {
  it('waits for the first input, and the first jump starts it', () => {
    const ready = createDinoRun(SEED)
    expect(ready.status).toBe('ready')
    expect(advance(ready, 1000)).toBe(ready)
    const jumped = pressJump(ready)
    expect(jumped.status).toBe('running')
    expect(jumped.jumps).toBe(1)
    expect(ready.obstacles[0].x).toBe(FIRST_OBSTACLE_X)
  })

  it('is the same for the same seed and inputs, and different for another seed', () => {
    const play = (seed: number) => {
      let state = pressJump(createDinoRun(seed))
      for (let frame = 0; frame < 240; frame++) {
        state = advance(state, 16)
        if (frame === 80 || frame === 160) state = pressJump(state)
        if (frame === 120) state = setDuck(state, true)
        if (frame === 130) state = setDuck(state, false)
      }
      return state
    }
    expect(play(SEED)).toEqual(play(SEED))
    expect(play(SEED + 1).obstacles.map((o) => o.kind + o.x)).not.toEqual(play(SEED).obstacles.map((o) => o.kind + o.x))
  })

  it('simulates in fixed steps whatever the frame rate, even with uneven frames', () => {
    const total = steps(600)
    const byFrames = (frames: number[]) => {
      let state = running([{ x: 5000 }, { x: 9000, kind: 'pillar' }])
      let spent = 0
      for (let i = 0; spent < total; i++) {
        const ms = Math.min(frames[i % frames.length], total - spent)
        state = advance(state, ms)
        spent += ms
      }
      return state
    }
    const at60 = byFrames([1000 / 60])
    for (const frames of [[1000 / 30], [1000 / 144], [5, 31, 9, 48, 2, 17]]) {
      const other = byFrames(frames)
      expect(other.steps).toBe(at60.steps)
      expect(other.distance).toBeCloseTo(at60.distance, 9)
      expect(other.obstacles).toEqual(at60.obstacles)
    }
    expect(at60.steps).toBe(600)
  })

  it('never simulates more than a second in one call, so a stalled tab does not jump ahead', () => {
    const state = advance(alone(), 60_000)
    expect(state.steps).toBe(Math.round(MAX_ADVANCE_MS / STEP_MS))
    expect(state.elapsedMs).toBeCloseTo(MAX_ADVANCE_MS, 6)
  })

  it('scores a tenth of the distance and gets faster up to a cap', () => {
    const state = advance(alone(), 1000)
    expect(state.score).toBe(Math.floor(state.distance / 10))
    expect(state.distance).toBeGreaterThan(SPEED.start * 0.99)
    expect(speedAt(0)).toBe(SPEED.start)
    expect(speedAt(30_000)).toBeGreaterThan(speedAt(10_000))
    expect(speedAt(60_000)).toBe(SPEED.max)
    expect(speedAt(1e9)).toBe(SPEED.max)
  })

  it('follows the speed curve to the step, as the server counts it', () => {
    // The same numbers as the server's rules (gamerules/DinoRunRunRulesTests.java): change both together.
    let state = alone()
    for (let i = 0; i < 12; i++) state = advance(state, 1000)
    expect(state.steps).toBe(1440)
    let reach = alone()
    while (reach.distance < 10_000) reach = advance(reach, STEP_MS)
    expect(reach.steps).toBe(3342)
    while (reach.distance < 60_000) reach = advance(reach, STEP_MS)
    expect(reach.steps).toBe(14753)
  })

  it('reports whole numbers about the run', () => {
    const state = advance(alone(), 900)
    expect(runDetails(state)).toEqual({
      meters: state.score,
      runMs: Math.round(state.elapsedMs),
      seconds: 0,
      level: 1,
      obstacles: 0,
      jumps: 0,
      ducks: 0,
      seed: SEED,
    })
  })
})

describe('jumping and ducking', () => {
  it('jumps to the jump height and lands after the airtime', () => {
    let state = pressJump(alone())
    let highest = 0
    let air = 0
    while (!onGround(state) || air === 0) {
      state = advance(state, STEP_MS)
      highest = Math.max(highest, state.runner.lift)
      air++
      expect(air).toBeLessThan(500)
    }
    expect(highest).toBeGreaterThan(JUMP_HEIGHT - 4)
    expect(highest).toBeLessThanOrEqual(JUMP_HEIGHT + 1)
    expect(air * STEP_MS).toBeGreaterThan(AIRTIME_S * 1000 - 3 * STEP_MS)
    expect(air * STEP_MS).toBeLessThan(AIRTIME_S * 1000 + 3 * STEP_MS)
    expect(state.runner).toEqual({ lift: 0, vy: 0, ducking: false })
  })

  it('has no double jump, but keeps a press made just before landing', () => {
    let state = pressJump(alone())
    state = advance(state, steps(20))
    state = pressJump(state)
    expect(state.jumps).toBe(1)
    // The early press runs out long before landing: one jump only.
    while (!onGround(state)) state = advance(state, STEP_MS)
    state = advance(state, steps(5))
    expect(state.jumps).toBe(1)

    // A press a few steps before landing jumps again on landing.
    state = pressJump(state)
    while (state.runner.vy > 0 || state.runner.lift > 12) state = advance(state, STEP_MS)
    state = pressJump(state)
    for (let i = 0; i < 12 && state.jumps < 3; i++) state = advance(state, STEP_MS)
    expect(state.jumps).toBe(3)
  })

  it('ducks low on the ground and drops fast in the air', () => {
    let state = setDuck(alone(), true)
    expect(state.runner.ducking).toBe(true)
    expect(state.ducks).toBe(1)
    expect(runnerMask(state).height).toBe(DUCK_A.height)
    state = setDuck(state, false)
    expect(runnerMask(state)).toBe(RUN_A)

    const landing = (drop: boolean) => {
      let flying = advance(pressJump(alone()), steps(30))
      if (drop) flying = setDuck(flying, true)
      let count = 0
      while (!onGround(flying)) {
        flying = advance(flying, STEP_MS)
        count++
      }
      return { count, ducking: flying.runner.ducking }
    }
    expect(landing(true).count).toBeLessThan(landing(false).count)
    expect(landing(true).ducking).toBe(true)
    expect(landing(false).ducking).toBe(false)
  })

  it('jumps straight out of a duck', () => {
    const state = pressJump(setDuck(alone(), true))
    expect(state.runner.ducking).toBe(false)
    expect(state.runner.vy).toBeGreaterThan(0)
    expect(runnerMask(advance(state, STEP_MS))).toBe(JUMP)
  })
})

describe('collisions', () => {
  const pip = (lift = 0) => ({ mask: RUN_A, x: RUNNER_X, bottom: WORLD.groundY - lift })

  it('follows the drawn outline: touching edges is not a hit, one unit more is', () => {
    // A solid wall as tall as Pip: its edge against Pip's nose is not a hit, one unit closer is.
    const wall = mask('wall', Array.from({ length: 30 }, () => '####'))
    const right = RUNNER_X + RUN_A.width
    expect(overlaps(pip(), { mask: wall, x: right, bottom: WORLD.groundY })).toBe(false)
    expect(overlaps(pip(), { mask: wall, x: right - 1, bottom: WORLD.groundY })).toBe(true)
    // Feet exactly on top of a mound: no hit; one unit lower: a hit.
    expect(overlaps(pip(MOUND.height), { mask: MOUND, x: RUNNER_X, bottom: WORLD.groundY })).toBe(false)
    expect(overlaps(pip(MOUND.height - 1), { mask: MOUND, x: RUNNER_X, bottom: WORLD.groundY })).toBe(true)
    // A mound's low shoulder against Pip's nose is not a hit: the outlines do not meet there.
    expect(overlaps(pip(), { mask: MOUND, x: right - 1, bottom: WORLD.groundY })).toBe(false)
  })

  it('never collides in a corner the sprite leaves empty', () => {
    // A one-pixel speck in Pip's empty top-left corner: inside the box, outside the drawing.
    const speck = mask('speck', ['#'])
    expect(overlaps(pip(), { mask: speck, x: RUNNER_X + 2, bottom: WORLD.groundY - RUN_A.height + 2 })).toBe(false)
    expect(overlaps(pip(), { mask: speck, x: RUNNER_X + 14, bottom: WORLD.groundY - RUN_A.height + 2 })).toBe(true)
  })

  it('lets a duck pass under a bat at head height, and not a runner standing', () => {
    const bat = { mask: BAT_UP, x: RUNNER_X, bottom: WORLD.groundY - BAT_LIFT.high }
    expect(overlaps(pip(), bat)).toBe(true)
    expect(overlaps({ mask: DUCK_A, x: RUNNER_X, bottom: WORLD.groundY }, bat)).toBe(false)
    const lowBat = { mask: BAT_UP, x: RUNNER_X, bottom: WORLD.groundY - BAT_LIFT.low }
    expect(overlaps({ mask: DUCK_A, x: RUNNER_X, bottom: WORLD.groundY }, lowBat)).toBe(true)
  })

  it('ends the run on contact and stays over until a new run', () => {
    let state = running([{ kind: 'pillar', x: RUNNER_X + RUN_A.width + 4 }])
    for (let i = 0; i < 120 && state.status === 'running'; i++) state = advance(state, STEP_MS)
    expect(state.status).toBe('over')
    expect(state.crash).toBe('pillar')
    expect(overlaps(runnerPlaced(state), obstaclePlaced(state.obstacles[0]))).toBe(true)
    expect(advance(state, 1000)).toBe(state)
    expect(pressJump(state)).toBe(state)
    expect(createDinoRun(SEED).status).toBe('ready')
  })

  it('counts an obstacle once Pip is past it', () => {
    let state = running([{ kind: 'mound', x: RUNNER_X + 140 }])
    let jumped = false
    for (let i = 0; i < 200 && state.status === 'running'; i++) {
      if (!jumped && state.obstacles[0].x < RUNNER_X + 80) {
        state = pressJump(state)
        jumped = true
      }
      state = advance(state, STEP_MS)
    }
    expect(state.status).toBe('running')
    expect(state.cleared).toBe(1)
    expect(state.obstacles.find((obstacle) => obstacle.id === 0)?.passed ?? true).toBe(true)
  })
})

describe('the course', () => {
  it('raises difficulty in steps, a little at a time', () => {
    expect(LEVELS.map((level) => level.fromScore)).toEqual([...LEVELS.map((level) => level.fromScore)].sort((a, b) => a - b))
    expect(levelFor(0).level).toBe(1)
    expect(levelFor(100_000).level).toBe(TOP_LEVEL)
    for (let i = 1; i < LEVELS.length; i++) {
      // Spacing never loosens, and kinds are only added.
      expect(LEVELS[i].spread[1]).toBeLessThanOrEqual(LEVELS[i - 1].spread[1])
      expect(LEVELS[i].spread[0]).toBeGreaterThanOrEqual(1)
      const before = new Set(LEVELS[i - 1].patterns.map(([pattern]) => pattern))
      for (const pattern of before) expect(LEVELS[i].patterns.map(([p]) => p)).toContain(pattern)
    }
    expect(minGap(SPEED.max)).toBeGreaterThan(minGap(SPEED.start))
  })

  it('always leaves a fair gap, over long courses and many seeds', () => {
    for (let seed = 1; seed <= 25; seed++) {
      const course = courseOf(seed * 7919, 90_000)
      expect(course.length).toBeGreaterThan(60)
      for (let i = 1; i < course.length; i++) {
        const previous = course[i - 1]
        const gap = course[i].at - (previous.at + previous.width)
        expect(gap).toBeGreaterThanOrEqual(minGap(speedAt(previous.at + previous.width)) - 1e-6)
      }
    }
  })

  it('brings in new obstacles as the run goes on', () => {
    const course = courseOf(42, 60_000)
    const early = course.filter((entry) => entry.at < 1500)
    expect(new Set(early.map((entry) => entry.obstacle.kind))).toEqual(new Set(['mound']))
    const late = course.filter((entry) => entry.at > 45_000)
    expect(new Set(late.map((entry) => entry.obstacle.kind))).toEqual(new Set(['mound', 'pillar', 'bat']))
    expect(late.some((entry) => entry.obstacle.count > 1)).toBe(true)
    expect(late.some((entry) => entry.obstacle.lift === BAT_LIFT.high)).toBe(true)
  })

  it('has shapes that fit the fairness rules', () => {
    // Ducking clears a head-height bat; standing does not; nothing is taller than a jump can clear.
    expect(DUCK_A.height).toBeLessThan(BAT_LIFT.high + 2)
    expect(RUN_A.height).toBeGreaterThan(BAT_LIFT.high + 2)
    expect(PILLAR.height).toBeLessThan(JUMP_HEIGHT - 40)
    expect(JUMP.width).toBeLessThanOrEqual(RUN_A.width)
  })
})
