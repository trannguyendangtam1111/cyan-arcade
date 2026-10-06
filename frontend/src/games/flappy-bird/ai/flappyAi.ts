import type { GameAI } from '@/games/shared/ai'
import { BIRD_X, crashAt, PHYSICS, pipesAhead, STEP_MS, stepBird, WORLD, worldSpeed } from '../engine/flappyEngine'
import type { Bird, FlappyState, PipePair } from '../types/flappyTypes'

/**
 * Flappy Bird AI: look ahead, then flap only when it is needed.
 *
 * Every {@link DECISION_STEPS} engine steps (30 times a second, about as often as a quick thumb) the
 * AI asks, for both "flap now" and "glide now": is there any way to keep flying for the next
 * {@link HORIZON_MS}? It answers with a depth-first search over future flap/glide choices, moving
 * the bird with the engine's own physics (`stepBird`) and testing it with the engine's own
 * collision test against the pipes, moving at the world's current speed.
 *
 * - Both safe: it steers towards a target in the lower part of the next gap (the bird can always
 *   flap up quickly, it cannot fall faster than gravity), flapping only when the bird would
 *   otherwise sink below it.
 * - One safe: it takes that one, whatever the target says.
 * - Neither: it takes whichever flies longer.
 *
 * It reads the game's structured state: the bird and the pipes the game has made, which are on
 * screen or about to scroll onto it. It never uses the seed to predict pipes that do not exist yet.
 * Its decisions depend only on the state passed in, so the same flight always plays the same way,
 * at any playback speed: speed changes how often the screen asks, not what the AI decides.
 */

export type FlappyMove = 'flap' | 'glide'

/** Why the AI chose its move, for the AI panel. */
export type FlappyStrategy = 'start' | 'climb' | 'glide' | 'dodge' | 'no-escape' | 'waiting'

export interface FlappyDecision {
  action: FlappyMove
  strategy: FlappyStrategy
  /** The height the AI is aiming for, or `null` when it is not steering (start, waiting). */
  targetY: number | null
  /** Engine steps the search found it can survive after flapping now, and after gliding now. */
  flapLookahead: number
  glideLookahead: number
}

export interface FlappyAI extends GameAI<FlappyState, FlappyMove> {
  /** Like `getNextAction`, with the reasons. */
  decide(state: Readonly<FlappyState>): FlappyDecision
}

/** The AI decides once every this many engine steps, and glides in between. */
export const DECISION_STEPS = 4
/** How far ahead it looks. */
export const HORIZON_MS = 1600
const HORIZON = Math.round(HORIZON_MS / (STEP_MS * DECISION_STEPS))
/** Extra room the AI keeps around the bird, against the world speeding up between two looks. */
const SAFETY_MARGIN = 1.5
/** The most positions one search may look at. Only a hopeless position comes near it. */
const SEARCH_BUDGET = 25_000
/** How far into the next gap (from its centre, as a share of its height) the AI aims. */
const TARGET_BELOW_CENTRE = 0.2
/** How far ahead (in seconds) the AI projects the bird when comparing it with the target. */
const AIM_AHEAD_S = 0.08
/** How close the next pipe must be before the AI starts aiming for the gap after it. */
const LEAN_AHEAD = 60
/** Room the AI leaves between the bird and the edge of the gap it is in while leaning. */
const LEAN_CLEARANCE = 8

export function createFlappyAi(): FlappyAI {
  const decide = (state: Readonly<FlappyState>): FlappyDecision => {
    if (state.status === 'ready') return idle('flap', 'start')
    if (state.status !== 'playing' || state.steps % DECISION_STEPS !== 0) return idle('glide', 'waiting')

    const pipes = pipesAhead(state)
    const shift = (worldSpeed(state) * STEP_MS) / 1000
    const targetY = target(pipes)
    const search = new Search(pipes, shift, targetY)

    const flapDepth = search.after(state.bird, true)
    const glideDepth = search.after(state.bird, false)
    const lookahead = { flapLookahead: flapDepth * DECISION_STEPS, glideLookahead: glideDepth * DECISION_STEPS }

    if (flapDepth >= HORIZON && glideDepth >= HORIZON) {
      const climb = wantsToClimb(state.bird, targetY)
      return { action: climb ? 'flap' : 'glide', strategy: climb ? 'climb' : 'glide', targetY, ...lookahead }
    }
    if (flapDepth >= HORIZON || glideDepth >= HORIZON) {
      return { action: flapDepth >= HORIZON ? 'flap' : 'glide', strategy: 'dodge', targetY, ...lookahead }
    }
    return { action: flapDepth > glideDepth ? 'flap' : 'glide', strategy: 'no-escape', targetY, ...lookahead }
  }

  return { decide, getNextAction: (state) => decide(state).action }
}

function idle(action: FlappyMove, strategy: FlappyStrategy): FlappyDecision {
  return { action, strategy, targetY: null, flapLookahead: 0, glideLookahead: 0 }
}


/**
 * Where to aim: the lower part of the next gap, or the middle of the sky while none is in sight.
 * Once the bird is close to (or inside) a pipe, it already leans towards the gap after it, as far
 * as the gap it is in allows: a big drop or climb then starts as early as it can.
 */
function target(pipes: readonly PipePair[]): number {
  const [current, following] = pipes
  if (!current) return WORLD.groundY / 2
  const aim = (pipe: PipePair) => pipe.gapY + pipe.gapHeight * TARGET_BELOW_CENTRE
  if (!following || current.x - BIRD_X > LEAN_AHEAD) return aim(current)
  const room = current.gapHeight / 2 - PHYSICS.birdRadius - LEAN_CLEARANCE
  return Math.min(current.gapY + room, Math.max(current.gapY - room, aim(following)))
}

/** Whether the bird, as it is moving, would soon be below the target. */
function wantsToClimb(bird: Bird, targetY: number): boolean {
  return bird.y + bird.vy * AIM_AHEAD_S > targetY
}

/**
 * One look ahead from the present position. Positions are remembered by (decision, height, speed),
 * rounded, so the many ways of reaching nearly the same place are only explored once.
 */
class Search {
  private readonly seen = new Map<number, number>()
  private positions = 0
  private readonly pipes: readonly PipePair[]
  /** How far the pipes move in one engine step. */
  private readonly shift: number
  private readonly targetY: number

  constructor(pipes: readonly PipePair[], shift: number, targetY: number) {
    this.pipes = pipes
    this.shift = shift
    this.targetY = targetY
  }

  /** How many decisions the bird survives (up to the horizon) after flapping now or not. */
  after(bird: Bird, flapNow: boolean): number {
    const moved = this.fly(bird, flapNow, 0)
    return moved ? this.explore(moved, 1) : 0
  }

  private explore(bird: Bird, depth: number): number {
    if (depth >= HORIZON) return HORIZON
    // (decision, height, speed / 10) packed into one number: heights stay well within ±1024 and speeds within ±5120.
    const key = (depth * 2048 + Math.round(bird.y) + 1024) * 1024 + Math.round(bird.vy / 10) + 512
    const known = this.seen.get(key)
    if (known !== undefined) return known
    // Out of budget: count this as the end of the road, which only makes the AI more careful.
    if (++this.positions > SEARCH_BUDGET) return depth

    let best = depth
    // The move it would make anyway first, so the first way found is the natural one.
    const climbFirst = wantsToClimb(bird, this.targetY)
    for (const flapNow of [climbFirst, !climbFirst]) {
      const moved = this.fly(bird, flapNow, depth)
      if (moved) best = Math.max(best, this.explore(moved, depth + 1))
      if (best >= HORIZON) break
    }
    this.seen.set(key, best)
    return best
  }

  /** The bird after one decision's worth of steps, or `null` if it crashes on the way. */
  private fly(bird: Bird, flapNow: boolean, depth: number): Bird | null {
    let current = bird
    for (let i = 0; i < DECISION_STEPS; i++) {
      current = stepBird(current, flapNow && i === 0)
      const stepsAhead = depth * DECISION_STEPS + i + 1
      if (crashAt(current.y, this.pipes, -this.shift * stepsAhead, SAFETY_MARGIN)) return null
    }
    return current
  }
}
