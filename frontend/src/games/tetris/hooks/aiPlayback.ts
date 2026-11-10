import { STEP_MS, gravityDelay } from '../engine/tetrisEngine'
import type { TetrisAction, TetrisState } from '../types/tetrisTypes'

/**
 * How the AI controller plays Tetris over time. No React here, so it can be tested on its own.
 *
 * AI mode runs on game time, as a human game runs on real time: each frame is `AI_FRAME_MS` of game
 * time, and the speed control only changes how much real time a frame takes. Within that game time
 * the AI meets the rules a player meets:
 *
 * - Gravity: a `TICK` every `gravityDelay(level)` ms of game time, whatever the AI does. In a timed
 *   game the frame is one `STEP` of the game's own clock instead, which brings gravity with it, so the
 *   AI's clock and gravity are exactly a player's, step for step.
 * - Input pace: a rotation or a one-column slide at most once every `MOVE_FRAMES` frames.
 * - Descent: once in position the AI soft drops one row per frame, so the piece is seen falling and
 *   locks the way a soft drop locks. It never hard drops.
 */

/** Game time per AI frame: one step of a timed game's clock. */
export const AI_FRAME_MS = STEP_MS

/** Frames between two rotations or slides: one every 120 ms of game time. */
export const MOVE_FRAMES = 3

export interface AiClock {
  /** Game time since the last gravity step. */
  sinceGravityMs: number
  /** Frames since the AI last rotated or slid the piece. */
  sinceMove: number
}

/** A fresh clock for a new game: the AI may make its first move on the first frame. */
export const startAiClock = (): AiClock => ({ sinceGravityMs: 0, sinceMove: MOVE_FRAMES - 1 })

/**
 * Plays one frame: the AI's input (if its pace allows it), then gravity. `decide` gives the AI's
 * action for a state; `apply` sends an action through the engine and returns the new state.
 */
export function playAiFrame(
  state: TetrisState,
  clock: AiClock,
  decide: (state: TetrisState) => TetrisAction,
  apply: (action: TetrisAction) => TetrisState,
): AiClock {
  if (state.status !== 'playing') return clock

  let current = state
  let sinceMove = clock.sinceMove + 1
  const action = decide(current)
  if (action === 'SOFT_DROP') {
    current = apply(action)
  } else if (sinceMove >= MOVE_FRAMES) {
    // A move the board refuses changes nothing; the AI plans again next time and gravity goes on.
    current = apply(action)
    sinceMove = 0
  }

  // A timed game keeps its own clock and gravity: one step of it is this frame.
  if (current.clock) {
    if (current.status === 'playing') apply('STEP')
    return { sinceGravityMs: clock.sinceGravityMs, sinceMove }
  }

  let sinceGravityMs = clock.sinceGravityMs + AI_FRAME_MS
  const delay = gravityDelay(current.level)
  if (sinceGravityMs >= delay) {
    sinceGravityMs -= delay
    if (current.status === 'playing') apply('TICK')
  }
  return { sinceGravityMs, sinceMove }
}
