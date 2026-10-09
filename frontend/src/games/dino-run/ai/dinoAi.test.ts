import { describe, expect, it } from 'vitest'
import { AI_SPEEDS } from '@/games/shared/ai'
import { BAT_LIFT, createDinoRun, pressJump, start } from '../engine/dinoEngine'
import { SPEED } from '../engine/difficulty'
import { advance } from '../engine/dinoEngine'
import { RUNNER_X, STEP_MS } from '../engine/physics'
import type { DinoState, Obstacle } from '../types/dinoTypes'
import { createDinoAi, DINO_STRATEGIES, type DecisionReason, type DinoStrategy } from './dinoAi'

/** Plays a run with the AI deciding every step, through the engine's own `advance`. */
function play(strategy: DinoStrategy, state: DinoState, ms: number, frameMs = 16) {
  const ai = createDinoAi(strategy)
  const log: { step: number; jump: boolean; duck: boolean; reason: DecisionReason }[] = []
  let current = state.status === 'ready' ? start(state) : state
  for (let spent = 0; spent < ms && current.status === 'running'; spent += frameMs) {
    current = advance(current, frameMs, (now) => {
      const decision = ai.decide(now)
      if (decision.input.jump || decision.input.duck || decision.reason === 'drop') log.push({ step: now.steps, ...decision.input, reason: decision.reason })
      return decision.input
    })
  }
  return { state: current, log }
}

/** A run with only these obstacles in it, at a chosen distance (so a chosen speed). */
function course(obstacles: Partial<Obstacle>[], distance = 0): DinoState {
  const state = start(createDinoRun(1))
  return {
    ...state,
    distance,
    obstacles: [
      ...obstacles.map((obstacle, id) => ({ id, kind: 'mound' as const, x: 420, lift: 0, count: 1, age: 0, passed: false, ...obstacle })),
      // Holds the generator off: nothing else comes for a long while.
      { id: 99, kind: 'mound' as const, x: 1e9, lift: 0, count: 1, age: 0, passed: false },
    ],
    nextObstacleId: 100,
  }
}

const SPEEDS = [0, 60_000]

describe('the Dino Run AI', () => {
  it.each(DINO_STRATEGIES)('%s clears every kind of obstacle, slow and at top speed', (strategy) => {
    const cases: Partial<Obstacle>[] = [
      { kind: 'mound' },
      { kind: 'pillar' },
      { kind: 'mound', count: 3 },
      { kind: 'bat', lift: BAT_LIFT.low },
      { kind: 'bat', lift: BAT_LIFT.high },
    ]
    for (const distance of SPEEDS) {
      for (const obstacle of cases) {
        const { state, log } = play(strategy, course([obstacle], distance), 2500)
        expect(state.status, `${strategy} vs ${obstacle.kind}/${obstacle.lift ?? 0}/${obstacle.count ?? 1} at ${distance}`).toBe('running')
        expect(state.cleared).toBeGreaterThanOrEqual(1)
        if (obstacle.kind === 'bat' && obstacle.lift === BAT_LIFT.high) expect(log.some((entry) => entry.duck && entry.reason === 'duck')).toBe(true)
        if (obstacle.kind !== 'bat' || obstacle.lift === BAT_LIFT.low) expect(state.jumps).toBeGreaterThanOrEqual(1)
      }
    }
  })

  it.each(DINO_STRATEGIES)('%s survives long runs on many seeds, as the course speeds up', (strategy) => {
    for (const seed of [3, 17, 99, 2026, 777]) {
      const { state } = play(strategy, createDinoRun(seed), 150_000, 50)
      expect(state.status, `${strategy} on seed ${seed} at score ${state.score}`).toBe('running')
      expect(state.distance).toBeGreaterThan(60_000)
    }
  })

  it('makes the same moves at every playback speed', () => {
    const logs = AI_SPEEDS.map((speed) => play('balanced', createDinoRun(5150), 40_000, 16 * speed).log)
    for (const log of logs) expect(log).toEqual(logs[0])
    expect(logs[0].length).toBeGreaterThan(10)
  })

  it('has strategies that really differ: margins, timing and recovery', () => {
    const jumpStep = (strategy: DinoStrategy, distance: number) => play(strategy, course([{ kind: 'pillar', x: 520 }], distance), 2500).log.find((entry) => entry.jump)?.step ?? -1
    for (const distance of SPEEDS) {
      const safe = jumpStep('safe', distance)
      const balanced = jumpStep('balanced', distance)
      const fast = jumpStep('fast', distance)
      expect(safe).toBeGreaterThan(0)
      // Safe jumps first, Fast Reaction last, Balanced in between.
      expect(safe).toBeLessThan(balanced)
      expect(balanced).toBeLessThan(fast)
    }
    // Only Fast Reaction drops out of its jumps on purpose.
    const drops = (strategy: DinoStrategy) => play(strategy, createDinoRun(31), 20_000).log.filter((entry) => entry.reason === 'drop').length
    expect(drops('fast')).toBeGreaterThan(0)
    expect(drops('safe')).toBe(0)
  })

  it('only answers with inputs: it changes nothing in the state it looks at', () => {
    const ai = createDinoAi('fast')
    const state = course([{ kind: 'pillar', x: RUNNER_X + 60 }], 30_000)
    const frozen = structuredClone(state)
    for (let i = 0; i < 20; i++) ai.decide(state)
    expect(state).toEqual(frozen)
    expect(Object.keys(ai.decide(state).input).sort()).toEqual(['duck', 'jump'])
  })

  it('plays through the same collision rules: with no way out, it crashes like anyone', () => {
    // A pillar already touching Pip's nose: no input can save the run.
    const state = course([{ kind: 'pillar', x: RUNNER_X + 33 }], 60_000)
    const { state: after } = play('safe', state, 1000)
    expect(after.status).toBe('over')
    expect(after.crash).toBe('pillar')
  })

  it('does not look at obstacles that are not on screen yet', () => {
    const ai = createDinoAi('safe')
    const offScreen = course([{ kind: 'pillar', x: 700 }])
    expect(ai.decide(offScreen).threat).toBeNull()
    const human = pressJump(createDinoRun(8))
    expect(ai.decide(human).input).toEqual({ jump: false, duck: false })
    expect(SPEED.max).toBeGreaterThan(SPEED.start)
    expect(STEP_MS).toBeGreaterThan(0)
  })
})
