import type { BrickKind, LevelBonus } from '../types/brickTypes'

/**
 * How Brick Breaker scores. Bricks score when they are destroyed, by kind, times the combo
 * multiplier, times two under x2 Score. A hit that only cracks a brick is worth a little. Clearing a
 * level adds a bonus. Every number is capped, so nothing multiplies without end; the server's rules
 * (`BrickBreakerRunRules`) use the same caps.
 */

export const BRICK_POINTS: Record<BrickKind, number> = { normal: 100, tough: 150, armored: 250, special: 200 }

/** A hit that does not destroy the brick. Never multiplied. */
export const HIT_POINTS = 10

/** The combo ends after this long without destroying a brick. */
export const COMBO_TIMEOUT_MS = 2500

/** The multiplier for a combo: 1 → x1.0, 2 → x1.2, 3 → x1.5, 4 → x2.0, 5 and more → x2.5. */
export function comboMultiplier(combo: number): number {
  if (combo <= 1) return 1
  if (combo === 2) return 1.2
  if (combo === 3) return 1.5
  if (combo === 4) return 2
  return 2.5
}

/** Combos worth celebrating: 5, 10, 15, 25, 40, then every 20. Rarer as they grow, so they stay special. */
export function isComboMilestone(combo: number): boolean {
  return [5, 10, 15, 25, 40].includes(combo) || (combo > 40 && combo % 20 === 0)
}

export function brickPoints(kind: BrickKind, combo: number, doubled: boolean): number {
  return Math.round(BRICK_POINTS[kind] * comboMultiplier(combo) * (doubled ? 2 : 1))
}

export const CLEAR_BONUS = {
  base: 500,
  basePerLevel: 100,
  maxBase: 1500,
  perLife: 100,
  perCombo: 20,
  maxCombo: 600,
  perSecondUnderPar: 5,
  maxTime: 500,
  perfect: 1000,
} as const

/** The bonus for clearing a level. */
export function levelBonus(
  level: number,
  livesLeft: number,
  levelMaxCombo: number,
  levelSeconds: number,
  parSeconds: number,
  perfect: boolean,
): LevelBonus {
  const base = Math.min(CLEAR_BONUS.base + CLEAR_BONUS.basePerLevel * (level - 1), CLEAR_BONUS.maxBase)
  const lives = CLEAR_BONUS.perLife * livesLeft
  const combo = Math.min(CLEAR_BONUS.perCombo * levelMaxCombo, CLEAR_BONUS.maxCombo)
  const time = Math.min(Math.max(0, Math.floor(parSeconds - levelSeconds)) * CLEAR_BONUS.perSecondUnderPar, CLEAR_BONUS.maxTime)
  const perfectBonus = perfect ? CLEAR_BONUS.perfect : 0
  return { level, base, lives, combo, time, perfect: perfectBonus, total: base + lives + combo + time + perfectBonus }
}
