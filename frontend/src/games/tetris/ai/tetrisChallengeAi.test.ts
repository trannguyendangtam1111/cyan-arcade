import { describe, expect, it } from 'vitest'
import { GARBAGE, HEIGHT, WIDTH, createTetrisGame, updateTetris, type TetrisAction, type TetrisState } from '../engine/tetrisEngine'
import { playAiFrame, startAiClock } from '../hooks/aiPlayback'
import { CHALLENGE_STAGES, createStageGame, type ChallengeStage } from '../stages'
import { choosePlacement, coveredGap, createTetrisAi } from './tetrisAi'

/** The inputs a player has. The AI may use nothing else (gravity and the clock are the driver's). */
const PLAYER_ACTIONS = new Set<TetrisAction>(['LEFT', 'RIGHT', 'ROTATE_CW', 'ROTATE_CCW', 'SOFT_DROP', 'HARD_DROP'])

/** Plays a stage to its end the way AI mode does: the AI's paced input, then one clock step a frame. */
function playStage(stage: ChallengeStage) {
  let state: TetrisState = createStageGame(stage)
  const ai = createTetrisAi()
  const actions = new Set<TetrisAction>()
  let clock = startAiClock()
  while (state.status === 'playing') {
    clock = playAiFrame(
      state,
      clock,
      (current) => {
        const { action } = ai.decide(current)
        actions.add(action)
        return action
      },
      (action) => (state = updateTetris(state, action)),
    )
  }
  return { state, actions }
}

/**
 * What the AI does on each stage's fixed seed, at its real pace. Stage 6 (Last stand) is the one it
 * does not clear: eight rows of garbage, a new row every eight pieces and a fast gravity outrun its
 * one-piece lookahead, on this seed and on most others (it clears 3 of 10 seeds; 4 of 10 even when
 * placing pieces instantly). Documented as "AI not guaranteed", not hidden: see TET-005a.
 */
const EXPECTED: Record<number, 'cleared' | 'not guaranteed'> = {
  1: 'cleared',
  2: 'cleared',
  3: 'cleared',
  4: 'cleared',
  5: 'cleared',
  6: 'not guaranteed',
}

describe('the Tetris AI on the Challenge stages', () => {
  it.each(CHALLENGE_STAGES.map((stage) => [`${stage.id} ${stage.name}`, stage] as [string, ChallengeStage]))(
    'stage %s, on its fixed seed',
    { timeout: 60_000 },
    (_, stage) => {
      const { state, actions } = playStage(stage)
      const clock = state.clock!
      const challenge = state.challenge!

      // Only a player's inputs, whatever the outcome.
      for (const action of actions) expect(PLAYER_ACTIONS.has(action)).toBe(true)
      expect(state.status).toBe('over')

      if (EXPECTED[stage.id] === 'cleared') {
        expect(clock.goalReached).toBe(true)
        expect(clock.timeUp).toBe(false)
        expect(clock.elapsedMs).toBeLessThan(stage.timed.limitMs ?? Infinity)
        if (stage.rules.dig) {
          expect(challenge.garbageCleared).toBe(challenge.garbageAdded)
          expect(state.board.includes(GARBAGE)).toBe(false)
        } else {
          expect(state.lines).toBeGreaterThanOrEqual(stage.timed.lineGoal ?? Infinity)
        }
      } else {
        // It never claims a stage it did not clear: the run failed, with garbage left.
        expect(clock.goalReached).toBe(false)
        expect(challenge.garbageCleared).toBeLessThan(challenge.garbageAdded)
        expect(state.board.includes(GARBAGE)).toBe(true)
      }
    },
  )

  it('takes the placement that clears the last garbage: the stage is won', () => {
    const start = createTetrisGame(7, { limitMs: null }, { level: 1, garbageRows: 1, riseEvery: null, dig: true })
    const gap = start.board.slice((HEIGHT - 1) * WIDTH).indexOf(null)
    // An I, which fits the gap upright.
    const placement = choosePlacement({ ...start, piece: { type: 'I', rotation: 0, x: 3, y: -1 } })

    expect(placement?.result.clock?.goalReached).toBe(true)
    expect(placement?.landing).toMatchObject({ rotation: 1, x: gap - 2 })
  })

  it('measures the cover over the topmost garbage gap, and nothing without garbage', () => {
    const start = createTetrisGame(7, { limitMs: null }, { level: 1, garbageRows: 2, riseEvery: null, dig: true })
    expect(coveredGap(start)).toBe(0)

    const top = HEIGHT - 2
    const gap = start.board.slice(top * WIDTH, (top + 1) * WIDTH).indexOf(null)
    const board = [...start.board]
    board[(top - 1) * WIDTH + gap] = 'O'
    board[(top - 3) * WIDTH + gap] = 'O'
    expect(coveredGap({ ...start, board })).toBe(2)

    expect(coveredGap(createTetrisGame(7))).toBe(0)
    expect(coveredGap(createTetrisGame(7, { limitMs: 120_000 }))).toBe(0)
  })
})
