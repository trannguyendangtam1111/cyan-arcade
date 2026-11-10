import { STEP_MS } from '../engine/tetrisEngine'

/**
 * How a player's timed game turns real time into steps of its clock. No React here, so it can be
 * tested on its own.
 *
 * Each frame brings some real time (already capped by `useFrameLoop`, so a stalled tab cannot make
 * the game jump ahead). Whole steps of `STEP_MS` are played for it; what is left over, less than a
 * step, waits for the next frame, and waits across a pause too: pausing again and again never throws
 * it away and never gives it twice. So the game time played is never more than the real time spent
 * playing, and never falls behind it by a step or more.
 *
 * @param pendingMs real time carried over from earlier frames, under one step
 * @param frameMs real time of this frame
 */
export function stepsDue(pendingMs: number, frameMs: number): { steps: number; pendingMs: number } {
  const total = pendingMs + Math.max(frameMs, 0)
  const steps = Math.floor(total / STEP_MS)
  return { steps, pendingMs: total - steps * STEP_MS }
}
