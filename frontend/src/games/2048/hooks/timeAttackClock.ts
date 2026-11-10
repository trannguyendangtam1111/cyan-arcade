import { CLOCK_STEP_MS } from '../engine/game2048Engine'

/**
 * How a human Time Attack run turns real time into steps of its game clock. No React here, so it can
 * be tested on its own. (Tetris has its own copy of this idea for its own step; it is not shared, so
 * neither game's timing can change the other's.)
 *
 * Each frame brings some real time (already capped by `useFrameLoop`, so a stalled tab cannot make
 * the clock jump ahead). Whole steps of `CLOCK_STEP_MS` are played for it; what is left over, less
 * than a step, waits for the next frame, and waits across a pause too: pausing again and again never
 * throws it away and never gives it twice. So the game time played never runs ahead of the real time
 * spent playing, and never falls behind it by a step or more.
 *
 * @param pendingMs real time carried over from earlier frames, under one step
 * @param frameMs real time of this frame
 */
export function clockStepsDue(pendingMs: number, frameMs: number): { steps: number; pendingMs: number } {
  const total = pendingMs + Math.max(frameMs, 0)
  const steps = Math.floor(total / CLOCK_STEP_MS)
  return { steps, pendingMs: total - steps * CLOCK_STEP_MS }
}
