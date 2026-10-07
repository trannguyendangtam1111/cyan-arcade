import { nextRandom } from '@/games/shared/random'
import type { BrickKind, PowerUpKind, TimedPowerUp } from '../types/brickTypes'

/**
 * Power-ups: what each does, how rare it is, and how often destroyed bricks drop anything at all.
 *
 * Every destroyed brick rolls once on its phase's drop table (from the run's seed, so the same play
 * drops the same things). Later phases drop a little more often, and better things: the game gets
 * harder, and so do the player's tools.
 */

export type Rarity = 'common' | 'uncommon' | 'rare' | 'veryRare'

export interface PowerUpDefinition {
  kind: PowerUpKind
  /** What the player reads on the capsule, the HUD and the pickup label. */
  label: string
  /** A short glyph drawn on the capsule, so it is never told apart by colour alone. */
  icon: string
  rarity: Rarity
  /** How long it lasts, for a timed one. Catching it again starts the time over (it never stacks). */
  durationMs?: number
}

export const POWER_UPS: Record<PowerUpKind, PowerUpDefinition> = {
  extraBall: { kind: 'extraBall', label: '+1 Ball', icon: '+1', rarity: 'common' },
  widePaddle: { kind: 'widePaddle', label: 'Wide', icon: '↔', rarity: 'common', durationMs: 10_000 },
  doubleScore: { kind: 'doubleScore', label: 'x2 Score', icon: 'x2', rarity: 'common', durationMs: 10_000 },
  laser: { kind: 'laser', label: 'Laser', icon: '⇡', rarity: 'uncommon', durationMs: 9_000 },
  magnet: { kind: 'magnet', label: 'Magnet', icon: 'U', rarity: 'uncommon', durationMs: 10_000 },
  fireball: { kind: 'fireball', label: 'Fireball', icon: '🔥', rarity: 'rare', durationMs: 7_000 },
  twoBalls: { kind: 'twoBalls', label: '+2 Balls', icon: '+2', rarity: 'rare' },
  multiBall: { kind: 'multiBall', label: 'Multi-Ball', icon: '✲', rarity: 'rare' },
  extraLife: { kind: 'extraLife', label: 'Extra Life', icon: '♥', rarity: 'veryRare' },
}

export const TIMED_POWER_UPS: readonly TimedPowerUp[] = ['doubleScore', 'widePaddle', 'fireball', 'laser', 'magnet']

/** Within a rarity, every power-up is equally likely. */
export const BY_RARITY: Record<Rarity, PowerUpKind[]> = {
  common: ['extraBall', 'widePaddle', 'doubleScore'],
  uncommon: ['laser', 'magnet'],
  rare: ['fireball', 'twoBalls', 'multiBall'],
  veryRare: ['extraLife'],
}

/** Chances per thousand destroyed bricks. Each table adds up to 1,000. */
export interface DropTable {
  none: number
  common: number
  uncommon: number
  rare: number
  veryRare: number
}

export const DROP_TABLES: Record<'early' | 'mid' | 'late', DropTable> = {
  /** Levels 1–2: learning. 18% of bricks drop something. */
  early: { none: 820, common: 120, uncommon: 40, rare: 17, veryRare: 3 },
  /** Levels 3–5: mastery. 20%. */
  mid: { none: 800, common: 130, uncommon: 50, rare: 17, veryRare: 3 },
  /** Level 6 on, Endless included: challenge. 23%, with more of the strong ones. */
  late: { none: 770, common: 140, uncommon: 60, rare: 25, veryRare: 5 },
}

export function dropTableFor(level: number): DropTable {
  if (level <= 2) return DROP_TABLES.early
  if (level <= 5) return DROP_TABLES.mid
  return DROP_TABLES.late
}

/**
 * What a destroyed brick drops for a roll in [0, 1), or `null` for nothing. `guaranteed` (a special
 * brick) skips the "nothing" share and rolls among the power-ups alone, at their usual proportions.
 */
export function rollDrop(table: DropTable, roll: number, guaranteed = false): PowerUpKind | null {
  const tiers: [Rarity, number][] = [
    ['common', table.common],
    ['uncommon', table.uncommon],
    ['rare', table.rare],
    ['veryRare', table.veryRare],
  ]
  const total = guaranteed ? 1000 - table.none : 1000
  let at = roll * total
  if (!guaranteed) {
    if (at < table.none) return null
    at -= table.none
  }
  for (const [rarity, weight] of tiers) {
    if (at < weight) {
      const kinds = BY_RARITY[rarity]
      return kinds[Math.min(kinds.length - 1, Math.floor((at / weight) * kinds.length))]
    }
    at -= weight
  }
  return BY_RARITY.common[0]
}

/**
 * The one drop decision of the game, made for every destroyed brick whoever is playing: the next
 * number of the run's random sequence, rolled on the level's table (a special brick always drops).
 * It sees only the seed, the level and the brick's kind, so the same seed and the same bricks
 * destroyed in the same order always drop the same things, for a player and for the AI alike.
 */
export function rollBrickDrop(seed: number, level: number, brick: BrickKind): { kind: PowerUpKind | null; seed: number } {
  const random = nextRandom(seed)
  return { kind: rollDrop(dropTableFor(level), random.value, brick === 'special'), seed: random.seed }
}

/** The most balls in play at once; balls beyond it are simply not made. */
export const MAX_BALLS = 8
/** The most lives a player can hold. */
export const MAX_LIVES = 5
/** Multi-Ball turns every ball into this many (1 → 3), up to the limit. */
export const MULTI_BALL_SPLIT = 3
/** Lasers fire by themselves, two at a time, this often. */
export const LASER_COOLDOWN_MS = 400
/** Falling power-ups drop at this speed. */
export const DROP_SPEED = 140
export const DROP_SIZE = { width: 30, height: 16 } as const
export const BOLT_SPEED = 820
