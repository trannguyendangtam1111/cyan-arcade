import type { AchievementStatus } from '@/api/profile'

/** How many closest goals the "Next up" row shows. */
export const NEXT_UP_LIMIT = 3

/** An achievement whose progress the server measured: a locked one with a countable goal. */
export type MeasuredAchievement = AchievementStatus & { progress: number; target: number }

/**
 * Whether the server measured this achievement's progress: locked, with a progress between none and
 * its target. Anything else (no goal, an older backend, a value out of range) shows no bar, so a bar
 * never claims more than the server counted.
 */
export function isMeasured(achievement: AchievementStatus): achievement is MeasuredAchievement {
  const { progress, target } = achievement
  return (
    !achievement.unlocked &&
    typeof progress === 'number' &&
    typeof target === 'number' &&
    Number.isFinite(progress) &&
    Number.isFinite(target) &&
    target > 0 &&
    progress >= 0 &&
    progress <= target
  )
}

/**
 * The locked achievements closest to being unlocked: by the share of the goal already reached, then
 * by what is left. Only what the server measured; the rest have no progress to compare.
 */
export function nextGoals(achievements: AchievementStatus[], limit = NEXT_UP_LIMIT): MeasuredAchievement[] {
  return achievements
    .filter(isMeasured)
    .sort((a, b) => b.progress / b.target - a.progress / a.target || a.target - a.progress - (b.target - b.progress))
    .slice(0, limit)
}
