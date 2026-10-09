import { AIRTIME_S } from './physics'
import { RUN_A } from './shapes'

/**
 * How Dino Run gets harder, by distance alone (never by time, frame rate or device):
 *
 * - **Speed** rises in a straight line with distance, from {@link SPEED.start} to {@link SPEED.max}
 *   units a second (reached at 60,000 units, a score of 6,000, about two minutes in), then stays.
 * - **What comes** and **how often** change in steps, by {@link LEVELS}: new kinds of obstacle first,
 *   tighter spacing later, never everything at once.
 *
 * The server's rules for the game (`gamerules/DinoRunRunRules.java`) use the same speed numbers to
 * check how long a run of a given distance must have lasted: change one, change both.
 */
export const SPEED = {
  start: 330,
  max: 690,
  /** Speed gained per unit run. */
  perUnit: 0.006,
} as const

export function speedAt(distance: number): number {
  return Math.min(SPEED.max, SPEED.start + SPEED.perUnit * distance)
}

/** One group of obstacles the generator may place. */
export type Pattern = 'mound' | 'pillar' | 'bat-low' | 'bat-high' | 'mounds-2' | 'mounds-3'

export interface Level {
  level: number
  /** The score this level starts at. */
  fromScore: number
  /** What may come, and how likely each is (relative weights). */
  patterns: readonly [Pattern, number][]
  /** The gap after an obstacle is between these multiples of the fair minimum (see {@link minGap}). */
  spread: readonly [number, number]
}

export const LEVELS: readonly Level[] = [
  { level: 1, fromScore: 0, patterns: [['mound', 1]], spread: [1.4, 2.6] },
  { level: 2, fromScore: 150, patterns: [['mound', 3], ['pillar', 1]], spread: [1.4, 2.6] },
  { level: 3, fromScore: 400, patterns: [['mound', 3], ['pillar', 2], ['bat-low', 1]], spread: [1.4, 2.6] },
  { level: 4, fromScore: 800, patterns: [['mound', 3], ['pillar', 2], ['bat-low', 1], ['bat-high', 2]], spread: [1.3, 2.4] },
  { level: 5, fromScore: 1400, patterns: [['mound', 3], ['pillar', 2], ['bat-low', 1], ['bat-high', 2], ['mounds-2', 2]], spread: [1.2, 2.2] },
  { level: 6, fromScore: 2200, patterns: [['mound', 2], ['pillar', 2], ['bat-low', 1], ['bat-high', 2], ['mounds-2', 2], ['mounds-3', 1]], spread: [1.1, 1.9] },
  { level: 7, fromScore: 3200, patterns: [['mound', 2], ['pillar', 2], ['bat-low', 2], ['bat-high', 3], ['mounds-2', 2], ['mounds-3', 2]], spread: [1.05, 1.7] },
  { level: 8, fromScore: 4500, patterns: [['mound', 2], ['pillar', 3], ['bat-low', 2], ['bat-high', 3], ['mounds-2', 2], ['mounds-3', 2]], spread: [1.0, 1.5] },
]

export const TOP_LEVEL = LEVELS.length

export function levelFor(score: number): Level {
  let current = LEVELS[0]
  for (const level of LEVELS) if (score >= level.fromScore) current = level
  return current
}

/** Time to see an obstacle after landing and react to it, in seconds. Generous for a human. */
export const REACTION_S = 0.12

/**
 * The smallest gap (from one obstacle's back edge to the next one's front) the generator ever leaves
 * at this speed: the ground covered during a whole jump, plus time to react, plus Pip's own width.
 * However late Pip jumped the first obstacle, there is time to land and jump (or duck) again, and one
 * jump can never have to clear two obstacles at once.
 */
export function minGap(speed: number): number {
  return speed * (AIRTIME_S + REACTION_S) + RUN_A.width
}
