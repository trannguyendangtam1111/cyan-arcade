import { describe, expect, it } from 'vitest'
import { advance, BIRD_X, createFlappyGame, flap, PHYSICS, STEP_MS, WORLD } from '../engine/flappyEngine'
import type { FlappyState, PipePair } from '../types/flappyTypes'
import { createFlappyAi, DECISION_STEPS, HORIZON_MS } from './flappyAi'

const ai = createFlappyAi()

/** A flight in progress at a decision step, with the bird and pipes as the test sets them. */
function at(bird: { y: number; vy: number }, pipes: PipePair[], steps = 400): FlappyState {
  return { ...flap(createFlappyGame(1)), bird, pipes, steps }
}

const pipe = (x: number, gapY: number, gapHeight = 150, id = 0): PipePair => ({ id, x, gapY, gapHeight, width: 70, passed: false })

/** Lets the AI fly a whole flight, `frameMs` of game time at a time, until it crashes or reaches `pipes`. */
function aiFlight(seed: number, pipes: number, frameMs = STEP_MS) {
  const pilot = createFlappyAi()
  let state = flap(createFlappyGame(seed))
  const flapSteps: number[] = []
  while (state.status === 'playing' && state.score < pipes) {
    state = advance(state, frameMs, (current) => {
      const yes = pilot.getNextAction(current) === 'flap'
      if (yes) flapSteps.push(current.steps)
      return yes
    })
  }
  return { state, flapSteps }
}

describe('Flappy Bird AI', () => {
  it('takes off on the start screen and does nothing after a crash', () => {
    expect(ai.decide(createFlappyGame(3))).toMatchObject({ action: 'flap', strategy: 'start' })
    const over: FlappyState = { ...at({ y: 300, vy: 0 }, []), status: 'over', crash: 'ground' }
    expect(ai.getNextAction(over)).toBe('glide')
  })

  it('decides 30 times a second and glides in between', () => {
    const state = at({ y: 400, vy: 300 }, [pipe(300, 250)])
    expect(ai.decide({ ...state, steps: DECISION_STEPS * 10 }).strategy).not.toBe('waiting')
    for (let offset = 1; offset < DECISION_STEPS; offset++) {
      expect(ai.decide({ ...state, steps: DECISION_STEPS * 10 + offset })).toMatchObject({ action: 'glide', strategy: 'waiting' })
    }
  })

  it('aims for the lower part of the next gap', () => {
    const decision = ai.decide(at({ y: 300, vy: 0 }, [pipe(300, 260, 150)]))
    expect(decision.targetY).toBeGreaterThan(260)
    expect(decision.targetY).toBeLessThan(260 + 75 - PHYSICS.birdRadius)
  })

  it('looks past a pipe it is inside towards the gap after it', () => {
    // In a gap at 200 with the next one far lower: it already leans to the bottom of this gap.
    const decision = ai.decide(at({ y: 200, vy: 0 }, [pipe(BIRD_X - 30, 200, 150, 0), pipe(BIRD_X + 186, 420, 150, 1)]))
    expect(decision.targetY).toBeGreaterThan(220)
    expect(decision.targetY).toBeLessThanOrEqual(200 + 75 - PHYSICS.birdRadius)
  })

  it('flaps when sinking below the gap, and glides when above it', () => {
    expect(ai.decide(at({ y: 420, vy: 250 }, [pipe(320, 260)])).action).toBe('flap')
    expect(ai.decide(at({ y: 180, vy: -150 }, [pipe(320, 300)])).action).toBe('glide')
  })

  it('saves itself from the ground and stays off the ceiling, whatever the target says', () => {
    const nearGround = ai.decide(at({ y: WORLD.groundY - 40, vy: 500 }, [pipe(360, 150)]))
    expect(nearGround.action).toBe('flap')
    const nearCeiling = ai.decide(at({ y: 45, vy: -300 }, [pipe(360, 420)]))
    expect(nearCeiling.action).toBe('glide')
  })

  it('knows when there is no way out', () => {
    // Already level with the upper pipe's face, too high for the gap below.
    const decision = ai.decide(at({ y: 120, vy: 0 }, [pipe(BIRD_X + PHYSICS.birdRadius + 2, 400, 130)]))
    expect(decision.strategy).toBe('no-escape')
    expect(['flap', 'glide']).toContain(decision.action)
  })

  it('only ever answers flap or glide, and looks ahead no further than its horizon', () => {
    const { state } = aiFlight(11, 25)
    expect(state.score).toBe(25)
    for (const y of [60, 200, 350, 480]) {
      for (const vy of [-470, 0, 400, 720]) {
        const decision = ai.decide(at({ y, vy }, state.pipes))
        expect(['flap', 'glide']).toContain(decision.action)
        const horizonSteps = Math.ceil(HORIZON_MS / STEP_MS)
        expect(decision.flapLookahead).toBeLessThanOrEqual(horizonSteps + DECISION_STEPS)
        expect(decision.glideLookahead).toBeLessThanOrEqual(horizonSteps + DECISION_STEPS)
      }
    }
  })

  it('decides the same way for the same position, and ignores the seed', () => {
    const state = at({ y: 330, vy: 120 }, [pipe(250, 300), pipe(500, 200, 150, 1)])
    expect(createFlappyAi().decide(state)).toEqual(createFlappyAi().decide(state))
    expect(ai.decide({ ...state, seed: 987654 })).toEqual(ai.decide(state))
  })

  it('flies the same flight every time from the same seed', () => {
    const one = aiFlight(42, 30)
    const two = aiFlight(42, 30)
    expect(two.flapSteps).toEqual(one.flapSteps)
    expect(two.state.score).toBe(one.state.score)
  })

  it('makes the same decisions at any playback speed', () => {
    // 1x shows one step per call; 8x shows a whole 133 ms of game time per frame.
    const normal = aiFlight(7, 15, STEP_MS)
    const ultra = aiFlight(7, 15, (1000 / 60) * 8)
    expect(ultra.flapSteps.slice(0, normal.flapSteps.length)).toEqual(normal.flapSteps)
    expect(ultra.state.score).toBeGreaterThanOrEqual(normal.state.score)
  })

  it.each([1, 2026, 31337])('flies through at least 60 pipes on course %i', (seed) => {
    const { state } = aiFlight(seed, 60)
    expect(state.score).toBe(60)
    expect(state.status).toBe('playing')
  })

  it('keeps going deep into the hardest level', () => {
    const { state } = aiFlight(777, 120)
    expect(state.score).toBe(120)
  })
})
