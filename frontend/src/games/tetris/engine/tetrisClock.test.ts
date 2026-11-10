import { describe, expect, it } from 'vitest'
import { createTetrisAi } from '../ai/tetrisAi'
import { playAiFrame, startAiClock } from '../hooks/aiPlayback'
import { stepsDue } from '../hooks/timedClock'
import type { TetrisAction, TetrisState } from '../types/tetrisTypes'
import { STEP_MS, createTetrisGame, gravityDelay, updateTetris } from './tetrisEngine'

const SEED = 12345

/** Plays `count` steps of the clock. */
function steps(state: TetrisState, count: number): TetrisState {
  let current = state
  for (let step = 0; step < count; step++) current = updateTetris(current, 'STEP')
  return current
}

/** A state at a given level, nothing else changed. */
const atLevel = (state: TetrisState, level: number): TetrisState => ({ ...state, level, lines: (level - 1) * 10 })

describe('the timed clock', () => {
  it('advances one second of game time in exactly 25 steps', () => {
    expect(STEP_MS).toBe(40)
    const timed = createTetrisGame(SEED, { limitMs: null })

    expect(steps(timed, 24).clock?.elapsedMs).toBe(960)
    expect(steps(timed, 25).clock?.elapsedMs).toBe(1000)
  })

  it('is a pure function of the steps played', () => {
    const timed = createTetrisGame(SEED, { limitMs: null })

    expect(steps(timed, 137)).toEqual(steps(timed, 137))
  })

  it('pulls the piece down once every gravity delay of game time, carrying the rest over', () => {
    // Level 1: 800 ms, exactly 20 steps.
    const levelOne = createTetrisGame(SEED, { limitMs: null })
    const y = levelOne.piece.y
    expect(steps(levelOne, 19).piece.y).toBe(y)
    expect(steps(levelOne, 20).piece.y).toBe(y + 1)
    expect(steps(levelOne, 40).piece.y).toBe(y + 2)

    // Level 2: 730 ms, not a whole number of steps. Gravity follows the game time played, rounded
    // to the step, never drifting: after n steps the piece has fallen floor(n × 40 / 730) rows.
    const levelTwo = atLevel(createTetrisGame(SEED, { limitMs: null }), 2)
    expect(gravityDelay(2)).toBe(730)
    for (let count = 0; count <= 120; count++) {
      expect(steps(levelTwo, count).piece.y).toBe(y + Math.floor((count * STEP_MS) / 730))
    }
  })

  it('gives the same game as Classic gravity, step for step', () => {
    // The timed game's gravity is the Classic TICK, at the same delays, on the clock.
    let classic = createTetrisGame(SEED)
    let timed = createTetrisGame(SEED, { limitMs: null })
    for (let tick = 0; tick < 60; tick++) {
      classic = updateTetris(classic, 'TICK')
      timed = steps(timed, Math.ceil(gravityDelay(timed.level) / STEP_MS))
      const { clock, ...withoutClock } = timed
      expect(withoutClock).toEqual(classic)
      expect(clock).toBeDefined()
    }
  })

  it('takes gravity from its clock alone: a TICK changes nothing', () => {
    const timed = createTetrisGame(SEED, { limitMs: 4000 })

    expect(updateTetris(timed, 'TICK')).toBe(timed)
  })

  it('keeps its clock through locked pieces and line clears', () => {
    let timed = steps(createTetrisGame(SEED, { limitMs: null }), 5)
    timed = updateTetris(timed, 'HARD_DROP')

    expect(timed.pieces).toBe(1)
    expect(timed.clock).toEqual({
      elapsedMs: 200,
      sinceGravityMs: 200,
      limitMs: null,
      timeUp: false,
      lineGoal: null,
      goalReached: false,
    })
  })

  it('ends the run at exactly its limit', () => {
    const timed = createTetrisGame(SEED, { limitMs: 2000 })

    const almost = steps(timed, 49)
    expect(almost.status).toBe('playing')
    expect(almost.clock?.elapsedMs).toBe(1960)

    const ended = updateTetris(almost, 'STEP')
    expect(ended.status).toBe('over')
    expect(ended.clock).toMatchObject({ elapsedMs: 2000, timeUp: true })
  })

  it('ignores every action once the run is over, the clock included', () => {
    const ended = steps(createTetrisGame(SEED, { limitMs: 400 }), 10)
    expect(ended.status).toBe('over')

    for (const action of ['STEP', 'TICK', 'LEFT', 'RIGHT', 'ROTATE_CW', 'ROTATE_CCW', 'SOFT_DROP', 'HARD_DROP'] as const) {
      expect(updateTetris(ended, action)).toBe(ended)
    }
  })

  it('says a run that topped out did not run out of time', () => {
    let timed = createTetrisGame(SEED, { limitMs: 120_000 })
    for (let piece = 0; piece < 100 && timed.status === 'playing'; piece++) timed = updateTetris(timed, 'HARD_DROP')

    expect(timed.status).toBe('over')
    expect(timed.clock).toMatchObject({ elapsedMs: 0, timeUp: false })
  })

  it('lets a piece turned in place stay in play for the whole run: no lower bound on pieces', () => {
    // A rotation may kick the piece up a row, undoing gravity, so the server's Ultra rules
    // (TetrisRunRules) set no minimum number of pieces for the game time.
    let timed = createTetrisGame(42, { limitMs: 120_000 })
    for (let step = 0; step < 3000 && timed.status === 'playing'; step++) {
      if (step % 10 === 0) timed = updateTetris(timed, step % 20 === 0 ? 'ROTATE_CW' : 'ROTATE_CCW')
      timed = updateTetris(timed, 'STEP')
    }

    expect(timed.clock).toMatchObject({ elapsedMs: 120_000, timeUp: true })
    expect(timed.pieces).toBe(0)
  })

    it('accepts only a limit of whole steps', () => {
    expect(() => createTetrisGame(SEED, { limitMs: 120_000 })).not.toThrow()
    expect(() => createTetrisGame(SEED, { limitMs: 1020 })).toThrow(/whole number of 40 ms steps/)
    expect(() => createTetrisGame(SEED, { limitMs: 0 })).toThrow()
    expect(() => createTetrisGame(SEED, { limitMs: -40 })).toThrow()
  })

  it('leaves a Classic game exactly as it was: no clock, and STEP changes nothing', () => {
    const classic = createTetrisGame(SEED)

    expect('clock' in classic).toBe(false)
    expect(updateTetris(classic, 'STEP')).toBe(classic)
    expect('clock' in updateTetris(classic, 'HARD_DROP')).toBe(false)
  })
})

describe("a player's timed clock (stepsDue)", () => {
  it('plays whole steps for the real time of each frame and carries the rest', () => {
    expect(stepsDue(0, 30)).toEqual({ steps: 0, pendingMs: 30 })
    expect(stepsDue(30, 30)).toEqual({ steps: 1, pendingMs: 20 })
    expect(stepsDue(20, 100)).toEqual({ steps: 3, pendingMs: 0 })
  })

  it('plays exactly 25 steps for one second of real time, however it is cut into frames', () => {
    for (const frameMs of [8, 10, 20, 25, 40, 50, 100]) {
      let pending = 0
      let played = 0
      for (let elapsed = 0; elapsed < 1000; elapsed += frameMs) {
        const due = stepsDue(pending, frameMs)
        pending = due.pendingMs
        played += due.steps
      }
      expect(played).toBe(25)
    }
  })

  it('never plays more game time than real time', () => {
    let pending = 0
    let played = 0
    let real = 0
    for (const frameMs of [3, 97, 41, 39, 16, 17, 100, 1, 0, 64]) {
      real += frameMs
      const due = stepsDue(pending, frameMs)
      pending = due.pendingMs
      played += due.steps
      expect(played * STEP_MS).toBeLessThanOrEqual(real)
      expect(real - played * STEP_MS).toBeLessThan(STEP_MS)
    }
  })

  it('ignores a negative frame', () => {
    expect(stepsDue(10, -50)).toEqual({ steps: 0, pendingMs: 10 })
  })
})

describe('the AI under a timed clock', () => {
  /** Plays AI frames through the real engine until the run ends; returns the actions it sent. */
  function playToTheEnd(state: TetrisState) {
    const ai = createTetrisAi()
    let current = state
    const applied: TetrisAction[] = []
    const apply = (action: TetrisAction) => {
      applied.push(action)
      current = updateTetris(current, action)
      return current
    }
    let clock = startAiClock()
    let frames = 0
    while (current.status === 'playing' && frames < 10_000) {
      clock = playAiFrame(current, clock, (now) => ai.decide(now).action, apply)
      frames++
    }
    return { state: current, applied, frames }
  }

  it('plays one clock step per frame and stops at exactly the limit', () => {
    const { state, applied, frames } = playToTheEnd(createTetrisGame(SEED, { limitMs: 4000 }))

    expect(frames).toBe(100)
    expect(applied.filter((action) => action === 'STEP')).toHaveLength(100)
    expect(state.clock).toMatchObject({ elapsedMs: 4000, timeUp: true })
  })

  it('sends only a legal input and the clock: never a TICK of its own, never a hard drop', () => {
    const { applied } = playToTheEnd(createTetrisGame(SEED, { limitMs: 8000 }))

    expect(applied).not.toContain('TICK')
    expect(applied).not.toContain('HARD_DROP')
    const legal = new Set<TetrisAction>(['STEP', 'SOFT_DROP', 'LEFT', 'RIGHT', 'ROTATE_CW', 'ROTATE_CCW'])
    expect(applied.filter((action) => !legal.has(action))).toEqual([])
    expect(applied).toContain('SOFT_DROP')
  })
})
