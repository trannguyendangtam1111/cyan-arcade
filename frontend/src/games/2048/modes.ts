import { MOVES_LIMIT, TIME_ATTACK_MS } from './engine/game2048Engine'
import { PUZZLE_STAGES, type PuzzleStage } from './engine/game2048Puzzles'

/**
 * The rulesets 2048 can be played under besides Classic, each a mode of its own on the server
 * (`Game2048RunRules`), offered only while the server declares it. Classic is the open-ended game.
 */
export interface Game2048Ruleset {
  /** The mode ID, as the server declares it. */
  mode: string
  name: string
  /** The valid moves a run has (Moves Limit). */
  moveLimit?: number
  /** The game time a run has, in milliseconds (Time Attack). */
  timeLimitMs?: number
  /** The stage played (Puzzle): its board, seed, target and move budget. */
  stage?: PuzzleStage
  /** What the player is asked to do, in a sentence. */
  objective: string
}

export const CLASSIC = 'classic'

/** Moves Limit: 300 valid moves, ranked by score. Making 2048 does not stop it. */
export const MOVES_LIMIT_MODE: Game2048Ruleset = {
  mode: 'moves',
  name: 'Moves Limit',
  moveLimit: MOVES_LIMIT,
  objective: `Score as many points as you can in ${MOVES_LIMIT} moves. A move that changes nothing doesn't count.`,
}

/**
 * Time Attack: two minutes of game time, ranked by score. The clock starts with the first valid move
 * and runs while the player thinks; making 2048 does not stop it.
 */
export const TIME_ATTACK_MODE: Game2048Ruleset = {
  mode: 'time-attack',
  name: 'Time Attack',
  timeLimitMs: TIME_ATTACK_MS,
  objective: 'Score as many points as you can in 2 minutes. The clock starts with your first move and runs while you think.',
}

export const RULESETS: readonly Game2048Ruleset[] = [MOVES_LIMIT_MODE, TIME_ATTACK_MODE]

/** The mode picker's entry for Puzzle, which then offers its stages. */
export const PUZZLE = 'puzzle'

/**
 * Puzzle: six fixed stages, each a mode of its own (`puzzle-1` … `puzzle-6`), unranked. A stage starts
 * from its board and seed, and is cleared by making its target within its moves.
 */
export const PUZZLE_MODES: readonly Game2048Ruleset[] = PUZZLE_STAGES.map((stage) => ({
  mode: stage.mode,
  name: `Stage ${stage.number}: ${stage.name}`,
  moveLimit: stage.moveLimit,
  stage,
  objective: `${stage.description} Make a ${stage.target} within ${stage.moveLimit} moves.`,
}))

/** Every ruleset besides Classic, by mode. */
export const findRuleset = (mode: string) =>
  RULESETS.find((option) => option.mode === mode) ?? PUZZLE_MODES.find((option) => option.mode === mode)

/**
 * How much longer than its game time a ranked Time Attack run may take in real time, in all: pauses,
 * a hidden tab, frames the browser dropped. The server refuses a run over it (`Game2048RunRules`).
 */
export const PAUSE_ALLOWANCE_MS = 60_000

/** A clock reading, rounded up to the second so it reaches 0:00 only at the end: `1:59`, `0:07`. */
export function formatClock(ms: number): string {
  const seconds = Math.max(0, Math.ceil(ms / 1000))
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}
