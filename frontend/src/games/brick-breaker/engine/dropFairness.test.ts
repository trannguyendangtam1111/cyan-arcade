/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { nextRandom } from '@/games/shared/random'
import { createBrickAi, predictLanding } from '../ai/brickAi'
import type { BrickKind, BrickState, PowerUpKind } from '../types/brickTypes'
import { advance, createBrickBreakerGame, STEP_MS, type StepInput, updateBrickBreaker } from './brickEngine'
import {
  BY_RARITY,
  DROP_TABLES,
  dropTableFor,
  LASER_COOLDOWN_MS,
  MAX_BALLS,
  MAX_LIVES,
  MULTI_BALL_SPLIT,
  POWER_UPS,
  rollBrickDrop,
  rollDrop,
  TIMED_POWER_UPS,
} from './powerUps'

/**
 * A player and the AI play by the same drop rules: one roll per destroyed brick, from the run's seed,
 * on the level's table. The AI only plays differently; it never gets other odds, rerolls or luck.
 */

/** What a run destroyed and dropped, in order, with the level each brick was on. */
interface Record {
  destroyed: { kind: BrickKind; level: number }[]
  drops: PowerUpKind[]
}

function record(record: Record, state: BrickState, levelBefore: number): number {
  let level = levelBefore
  for (const event of state.events) {
    if (event.type === 'levelStart') level = event.level
    if (event.type === 'brickDestroyed') record.destroyed.push({ kind: event.kind, level })
    if (event.type === 'drop') record.drops.push(event.kind)
  }
  return level
}

/** An AI run, one engine step per call, with the input it gave at every step. */
function aiRun(seed: number, steps: number) {
  const pilot = createBrickAi()
  let state = createBrickBreakerGame(seed)
  const inputs: StepInput[] = []
  const seen: Record = { destroyed: [], drops: [] }
  let level = state.level
  for (let i = 0; i < steps && state.phase !== 'over'; i++) {
    state = advance(state, STEP_MS, (current) => {
      const input = pilot.getNextAction(current)
      inputs.push(input)
      return input
    })
    level = record(seen, state, level)
  }
  return { state, inputs, seen }
}

/**
 * A run played the way a person plays, through the same actions as the pointer and the launch
 * button: late (150 ms behind), a little off, and never chasing power-ups.
 */
function humanRun(seed: number, frames: number) {
  let state = updateBrickBreaker(createBrickBreakerGame(seed), { type: 'launch' })
  let noise = seed
  const history: BrickState[] = []
  const seen: Record = { destroyed: [], drops: [] }
  let level = state.level
  for (let i = 0; i < frames && state.phase !== 'over'; i++) {
    history.push(state)
    if (history.length > 9) history.shift()
    const landing = history[0].balls
      .filter((ball) => ball.vy > 0)
      .map((ball) => predictLanding(ball))
      .filter((found) => found !== null)
      .sort((a, b) => a.seconds - b.seconds)[0]
    const random = nextRandom(noise)
    noise = random.seed
    if (landing) state = updateBrickBreaker(state, { type: 'aim', x: landing.x + (random.value - 0.5) * 60 })
    if (state.phase === 'serving') state = updateBrickBreaker(state, { type: 'launch' })
    state = advance(state, 1000 / 60)
    level = record(seen, state, level)
  }
  return { state, seen }
}

/** The drops the plain rule gives for these bricks destroyed in this order from this seed. */
function expectedDrops(initialSeed: number, destroyed: Record['destroyed']) {
  let seed = initialSeed
  const drops: PowerUpKind[] = []
  for (const brick of destroyed) {
    const roll = rollBrickDrop(seed, brick.level, brick.kind)
    seed = roll.seed
    if (roll.kind) drops.push(roll.kind)
  }
  return { drops, seed }
}

describe('drops for a player and for the AI', () => {
  it('are the same when the AI\'s inputs are given as a player\'s pointer and launch', () => {
    const ai = aiRun(31, 20_000)
    expect(ai.seen.destroyed.length).toBeGreaterThan(40)
    expect(ai.seen.drops.length).toBeGreaterThan(5)

    // The same inputs at the same steps, through the actions a player's pointer and button send.
    let state = createBrickBreakerGame(31)
    const seen: Record = { destroyed: [], drops: [] }
    let level = state.level
    for (const input of ai.inputs) {
      if (input.aim !== undefined) state = updateBrickBreaker(state, { type: 'aim', x: input.aim })
      if (input.launch) state = updateBrickBreaker(state, { type: 'launch' })
      state = advance(state, STEP_MS)
      level = record(seen, state, level)
    }
    expect(seen).toEqual(ai.seen)
    expect(state).toEqual(ai.state)
  })

  it.each([
    ['the AI', () => aiRun(5, 40_000)],
    ['a player', () => humanRun(5, 12_000)],
  ])('follow from the seed and the bricks destroyed alone, for %s', (_, play) => {
    const { state, seen } = play()
    expect(seen.destroyed.length).toBeGreaterThan(60)
    // Recomputed with nothing but the seed and the bricks in order: no extra rolls, no other odds.
    const expected = expectedDrops(state.initialSeed, seen.destroyed)
    expect(seen.drops).toEqual(expected.drops)
    expect(state.seed).toBe(expected.seed)
  })

  it('give every special brick a drop, whoever destroys it', () => {
    for (const { seen, state } of [aiRun(12, 60_000), humanRun(12, 20_000)]) {
      const specials = seen.destroyed.filter((brick) => brick.kind === 'special').length
      expect(specials).toBeGreaterThan(0)
      // Each special's roll is a drop: recomputing gives one for every special.
      let seed = state.initialSeed
      for (const brick of seen.destroyed) {
        const roll = rollBrickDrop(seed, brick.level, brick.kind)
        seed = roll.seed
        if (brick.kind === 'special') expect(roll.kind).not.toBeNull()
      }
    }
  })

  it('are untouched by the AI looking at the game', () => {
    const pilot = createBrickAi()
    let state = createBrickBreakerGame(8)
    for (let i = 0; i < 6000 && state.phase !== 'over'; i++) {
      state = advance(state, STEP_MS, (current) => {
        const before = JSON.stringify(current)
        const input = pilot.getNextAction(current)
        pilot.decide(current)
        expect(JSON.stringify(current)).toBe(before)
        return input
      })
    }
    expect(state.stats.bricks).toBeGreaterThan(10)
  })

  it('cannot be reached by the AI: it uses no randomness and no drop rules', () => {
    const source = readFileSync(join(process.cwd(), 'src/games/brick-breaker/ai/brickAi.ts'), 'utf8')
    expect(source).not.toMatch(/shared\/random|nextRandom|rollDrop|rollBrickDrop|DROP_TABLES|dropTableFor|\.seed\s*=/)
  })
})

describe('the drop rule', () => {
  it('is the table roll on the next random number, special bricks always dropping', () => {
    let seed = 77
    for (let i = 0; i < 20_000; i++) {
      const level = 1 + (i % 12)
      const kind: BrickKind = i % 7 === 0 ? 'special' : i % 3 === 0 ? 'tough' : 'normal'
      const random = nextRandom(seed)
      const roll = rollBrickDrop(seed, level, kind)
      expect(roll.seed).toBe(random.seed)
      expect(roll.kind).toBe(rollDrop(dropTableFor(level), random.value, kind === 'special'))
      if (kind === 'special') expect(roll.kind).not.toBeNull()
      seed = roll.seed
    }
  })

  it('keeps its tables exactly as they were', () => {
    expect(DROP_TABLES).toEqual({
      early: { none: 820, common: 120, uncommon: 40, rare: 17, veryRare: 3 },
      mid: { none: 800, common: 130, uncommon: 50, rare: 17, veryRare: 3 },
      late: { none: 770, common: 140, uncommon: 60, rare: 25, veryRare: 5 },
    })
    expect(BY_RARITY).toEqual({
      common: ['extraBall', 'widePaddle', 'doubleScore'],
      uncommon: ['laser', 'magnet'],
      rare: ['fireball', 'twoBalls', 'multiBall'],
      veryRare: ['extraLife'],
    })
  })

  it('keeps power-up stacking and caps as they were', () => {
    expect(MAX_BALLS).toBe(8)
    expect(MAX_LIVES).toBe(5)
    expect(MULTI_BALL_SPLIT).toBe(3)
    expect(LASER_COOLDOWN_MS).toBe(400)
    expect(Object.fromEntries(TIMED_POWER_UPS.map((kind) => [kind, POWER_UPS[kind].durationMs]))).toEqual({
      doubleScore: 10_000,
      widePaddle: 10_000,
      fireball: 7_000,
      laser: 9_000,
      magnet: 10_000,
    })
  })
})
