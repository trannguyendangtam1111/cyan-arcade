import type { TimedRules } from './engine/tetrisEngine'

/**
 * The rulesets Tetris can be played under. Classic is every game's; Ultra is a two-minute score
 * attack; Sprint is a race to clear 40 lines; Challenge is six fixed stages (`stages.ts`), each a mode
 * of its own on the server.
 */
export type TetrisRuleset = 'classic' | 'ultra' | 'sprint' | 'challenge'

/** Ultra's mode ID, as the server declares it. */
export const ULTRA_MODE = 'ultra'

/** Two minutes of game time, in the engine's 40 ms steps. */
export const ULTRA: TimedRules = { limitMs: 120_000 }

/** Sprint's mode ID, as the server declares it. */
export const SPRINT_MODE = 'sprint'

/** The lines a sprint must clear. */
export const SPRINT_LINES = 40

/**
 * Clear 40 lines, within five minutes of game time: the run that reaches the limit first has timed
 * out. Its time is the game time of the clear that reached the goal (`TetrisRunRules`).
 */
export const SPRINT: TimedRules = { limitMs: 300_000, lineGoal: SPRINT_LINES }

/**
 * How much longer than its game time a ranked timed run may take in real time, in all: pauses, a
 * hidden tab, frames the browser dropped. The server refuses a run over it (`TetrisRunRules`).
 */
export const PAUSE_ALLOWANCE_MS = 60_000

/** A clock reading, rounded up to the second so it reaches 0:00 only at the end: `1:59`, `0:07`. */
export function formatClock(ms: number): string {
  const seconds = Math.max(0, Math.ceil(ms / 1000))
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}
