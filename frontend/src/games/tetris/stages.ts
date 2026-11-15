import { createTetrisGame, type ChallengeRules, type TimedRules } from './engine/tetrisEngine'
import type { TetrisState } from './types/tetrisTypes'

/**
 * Tetris Challenge: six stages played on the timed games' fixed-step clock, each with garbage, a
 * fixed gravity and an objective. Every stage has a fixed seed, so each attempt at a stage is the
 * same game: the same garbage, the same pieces.
 *
 * A stage is won by meeting its objective (its line goal, or clearing every garbage block) before
 * its time limit; topping out or running out of time fails it. Lines cleared from garbage rows
 * count towards a line goal. The time it took is the stage's result, lowest best.
 */
export interface ChallengeStage {
  /** 1 to 6, in the order they are played. */
  id: number
  /** The mode the stage will be played under on the server, `challenge-1` to `challenge-6`. */
  mode: string
  name: string
  /** The seed of the stage's pieces and of its garbage. */
  seed: number
  /** Its clock: the time limit and, for a line goal, the lines. */
  timed: TimedRules
  /** Its garbage, fixed level and kind of objective. */
  rules: ChallengeRules
}

const stage = (
  id: number,
  name: string,
  seed: number,
  { garbageRows, riseEvery, goal, level, limitMs }: {
    garbageRows: number
    riseEvery?: number
    goal: number | 'dig'
    level: number
    limitMs: number
  },
): ChallengeStage => ({
  id,
  mode: `challenge-${id}`,
  name,
  seed,
  timed: goal === 'dig' ? { limitMs } : { limitMs, lineGoal: goal },
  rules: { level, garbageRows, riseEvery: riseEvery ?? null, dig: goal === 'dig' },
})

const MINUTE = 60_000

/** The stages, easiest first. Garbage depth, rising pressure and gravity go up together. */
export const CHALLENGE_STAGES: readonly ChallengeStage[] = [
  stage(1, 'Clean-up', 10_101, { garbageRows: 4, goal: 'dig', level: 1, limitMs: 2 * MINUTE }),
  stage(2, 'Ten on top', 20_202, { garbageRows: 6, goal: 10, level: 3, limitMs: 2 * MINUTE }),
  stage(3, 'Deep dig', 30_303, { garbageRows: 10, goal: 'dig', level: 3, limitMs: 3 * MINUTE }),
  stage(4, 'Rising tide', 40_404, { garbageRows: 4, riseEvery: 10, goal: 15, level: 5, limitMs: 3 * MINUTE }),
  stage(5, 'Pressure', 50_505, { garbageRows: 6, riseEvery: 7, goal: 20, level: 7, limitMs: 3 * MINUTE }),
  stage(6, 'Last stand', 60_606, { garbageRows: 8, riseEvery: 8, goal: 'dig', level: 9, limitMs: 4 * MINUTE }),
]

/** A fresh game of a stage: always the same one. */
export function createStageGame(stage: ChallengeStage): TetrisState {
  return createTetrisGame(stage.seed, stage.timed, stage.rules)
}

/** The stage played under a mode, if the mode is a stage's. */
export const stageOfMode = (mode: string | undefined) => CHALLENGE_STAGES.find((stage) => stage.mode === mode)

/** What a stage asks for, in a phrase: "Clear all the garbage", "Clear 10 lines". */
export const objectiveOf = ({ timed, rules }: ChallengeStage) =>
  rules.dig ? 'Clear all the garbage' : `Clear ${timed.lineGoal} lines`

/** A sentence about a stage's rising garbage, or nothing for a stage without it. */
export const risingOf = ({ rules }: ChallengeStage) =>
  rules.riseEvery === null ? '' : ` A garbage row rises every ${rules.riseEvery} pieces.`
