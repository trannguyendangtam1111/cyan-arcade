import type { GameAI } from '@/games/shared/ai'
import { forPrediction, obstacleMask, onGround, predictStep, runnerMask, worldSpeed } from '../engine/dinoEngine'
import { RUNNER_X, STEP_S, WORLD } from '../engine/physics'
import type { DinoInput, DinoState, Obstacle, ObstacleKind } from '../types/dinoTypes'

/**
 * Dino Run's AI: a predictive runner. Before every step it looks at the nearest obstacle on screen
 * (only what a player can see: obstacles not yet in view are not looked at, and the course's seed is
 * never used), and plays candidate plans forward with the engine's own physics and collision
 * ({@link predictStep}): run on, jump now, jump a little later, duck now, drop fast. It takes the plan
 * its strategy prefers among the ones that clear the obstacle with its safety margin.
 *
 * It only ever answers with an input (jump, duck) for the coming step; the engine plays that step
 * like any player's, so the AI cannot move Pip, change the score or pass through anything.
 *
 * The strategies differ in margin and in timing, and only there:
 * - **Safe Runner**: a 6-unit safety margin, and it acts at the earliest moment that works.
 * - **Balanced Runner**: a 3-unit margin, acting a few steps before the last moment.
 * - **Fast Reaction**: a 1-unit margin, acting at the very last step that still works, and dropping
 *   fast out of every jump once it is past the obstacle, to be ready sooner.
 */

export type DinoStrategy = 'safe' | 'balanced' | 'fast'

export const DINO_STRATEGIES: readonly DinoStrategy[] = ['safe', 'balanced', 'fast']

interface StrategyConfig {
  /** World units added around every obstacle in its predictions. */
  margin: number
  /** Act when acting this many steps later would no longer work; `null` acts as early as it can. */
  lead: number | null
  /** Drop fast out of a jump as soon as the obstacle is behind. */
  quickDrop: boolean
}

export const STRATEGY_CONFIG: Readonly<Record<DinoStrategy, StrategyConfig>> = {
  safe: { margin: 6, lead: null, quickDrop: false },
  balanced: { margin: 3, lead: 6, quickDrop: false },
  fast: { margin: 1, lead: 1, quickDrop: true },
}

export type DecisionReason = 'clear' | 'waiting' | 'jump' | 'duck' | 'drop' | 'airborne' | 'no-safe-move'

export interface DinoDecision {
  input: DinoInput
  reason: DecisionReason
  /** The obstacle being dealt with, if any. */
  threat: ObstacleKind | null
  /** How long until it reaches Pip at the current speed, in ms. */
  contactMs: number | null
}

export interface DinoAI extends GameAI<DinoState, DinoInput> {
  readonly strategy: DinoStrategy
  decide(state: Readonly<DinoState>): DinoDecision
}

/** The most steps a prediction looks ahead: far more than any obstacle takes to pass. */
const MAX_HORIZON = 240

const RUN: DinoInput = { jump: false, duck: false }
const DUCK: DinoInput = { jump: false, duck: true }

/** What to do at each step of a prediction, knowing where the predicted Pip is. */
type Plan = (step: number, sim: Readonly<DinoState>) => DinoInput

const run: Plan = () => RUN
const jumpAt = (at: number): Plan => (step) => (step === at ? { jump: true, duck: false } : RUN)
const duckFrom = (from: number): Plan => (step) => (step >= from ? DUCK : RUN)
/** Drop fast to the ground, then run on. */
const drop: Plan = (_, sim) => (onGround(sim) ? RUN : DUCK)

export function createDinoAi(strategy: DinoStrategy = 'balanced'): DinoAI {
  const config = STRATEGY_CONFIG[strategy]

  const decide = (state: Readonly<DinoState>): DinoDecision => {
    if (state.status !== 'running') return { input: RUN, reason: 'clear', threat: null, contactMs: null }
    const nearest = nextObstacle(state)
    if (!nearest) {
      // Nothing on screen. Fast Reaction still drops out of a jump to be ready sooner.
      const dropping = config.quickDrop && !onGround(state) && state.runner.vy < 0
      return { input: dropping ? DUCK : RUN, reason: dropping ? 'drop' : 'clear', threat: null, contactMs: null }
    }

    const speed = worldSpeed(state)
    const contactMs = Math.max(0, ((nearest.x - (RUNNER_X + runnerMask(state).width)) / speed) * 1000)
    const said = (input: DinoInput, reason: DecisionReason): DinoDecision => ({ input, reason, threat: nearest.kind, contactMs })
    const clears = (plan: Plan, margin = config.margin) => survives(state, nearest, plan, margin)

    if (!onGround(state)) {
      // In the air the only choice is whether to drop fast, so plans are judged until landing:
      // what to do on the ground is decided there.
      const lands = (plan: Plan) => outcome(state, nearest, plan, config.margin, true) === 'clear'
      if (config.quickDrop && state.runner.vy < 0 && lands(drop)) return said(DUCK, 'drop')
      if (lands(run)) return said(RUN, 'airborne')
      if (lands(drop)) return said(DUCK, 'drop')
      return said(RUN, 'no-safe-move')
    }

    // On the ground and nothing in the way: run (standing up if ducking).
    if (clears(run)) return said(RUN, 'clear')

    const duckWorks = clears(duckFrom(0))
    if (nearest.kind === 'bat' && duckWorks) {
      if (config.lead === null || !clears(duckFrom(config.lead))) return said(DUCK, 'duck')
      return said(RUN, 'waiting')
    }
    const jumpNow = outcome(state, nearest, jumpAt(0), config.margin)
    if (jumpNow === 'clear') {
      if (config.lead === null || !clears(jumpAt(config.lead))) return said({ jump: true, duck: false }, 'jump')
      return said(RUN, 'waiting')
    }
    if (duckWorks) return said(DUCK, 'duck')
    // Jumping now would come down too soon: the moment to jump is still ahead.
    if (jumpNow === 'early') return said(RUN, 'waiting')
    // The moment with the margin has passed: whatever still works at all, as a last chance.
    if (clears(jumpAt(0), 0)) return said({ jump: true, duck: false }, 'jump')
    if (clears(duckFrom(0), 0)) return said(DUCK, 'duck')
    return said(RUN, 'no-safe-move')
  }

  return {
    strategy,
    decide,
    getNextAction: (state) => decide(state).input,
  }
}

/** The nearest obstacle Pip has not passed yet, if it is on screen. */
export function nextObstacle(state: Readonly<DinoState>): Obstacle | undefined {
  return state.obstacles.find((obstacle) => !obstacle.passed && obstacle.x + obstacleMask(obstacle).width >= RUNNER_X && obstacle.x < WORLD.width)
}

/**
 * Plays a plan forward against one obstacle with the engine's own steps, until the obstacle is
 * behind Pip (and Pip is back on the ground or clear of it).
 */
function survives(state: Readonly<DinoState>, obstacle: Obstacle, plan: Plan, margin: number): boolean {
  return outcome(state, obstacle, plan, margin) === 'clear'
}

/**
 * How a plan ends against one obstacle (or, `untilLanding`, until Pip is back on the ground): cleared, or a hit. A hit on the way down or after landing
 * means the jump came too soon ("early": the right moment is still ahead); any other hit, too late.
 */
function outcome(state: Readonly<DinoState>, obstacle: Obstacle, plan: Plan, margin: number, untilLanding = false): 'clear' | 'early' | 'late' {
  const sim = forPrediction(state, [obstacle])
  const perStep = Math.max(1, worldSpeed(state) * STEP_S)
  const horizon = Math.min(MAX_HORIZON, Math.ceil((obstacle.x + obstacleMask(obstacle).width + margin - RUNNER_X) / perStep) + 2)
  let jumped = false
  for (let step = 0; step < horizon; step++) {
    const hit = predictStep(sim, plan(step, sim), margin)
    if (sim.runner.vy !== 0 || sim.runner.lift > 0) jumped = true
    if (hit) return jumped && (sim.runner.vy < 0 || onGround(sim)) ? 'early' : 'late'
    if (untilLanding && onGround(sim)) return 'clear'
  }
  return 'clear'
}

/** What AI mode is given: one AI per strategy, made on request. Loaded only for admins. */
export interface DinoAiKit {
  forStrategy(strategy: DinoStrategy): DinoAI
}

export function createDinoAiKit(): DinoAiKit {
  return { forStrategy: createDinoAi }
}
