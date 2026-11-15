import { useState } from 'react'
import { Flag, Lock, Trophy } from 'lucide-react'
import { useAchievements, type AchievementGoal, type AchievementStatus } from '@/api/profile'
import { cardStyles } from '@/components/ui/cardStyles'
import { ErrorState } from '@/components/ui/ErrorState'
import { FilterChip } from '@/components/ui/FilterChip'
import { LoadingState } from '@/components/ui/LoadingState'
import { cn } from '@/lib/cn'
import { formatDate, formatScore } from '@/lib/format'
import { isMeasured, nextGoals, type MeasuredAchievement } from './achievementGoals'

type Filter = 'all' | 'unlocked' | 'locked'

/** Every achievement in the arcade: the ones the player has, the ones closest to unlocking, and the rest. */
export function AchievementGrid() {
  const { data: achievements, isPending, isError, refetch } = useAchievements(true)
  const [filter, setFilter] = useState<Filter>('all')
  const unlocked = achievements?.filter((achievement) => achievement.unlocked) ?? []
  const locked = achievements?.filter((achievement) => !achievement.unlocked) ?? []
  const shown = filter === 'unlocked' ? unlocked : filter === 'locked' ? locked : (achievements ?? [])
  const goals = achievements ? nextGoals(achievements) : []

  return (
    <section aria-labelledby="achievements-heading">
      <h2 id="achievements-heading" className="mb-1 text-2xl font-bold">
        Achievements{' '}
        {achievements && (
          <span className="ml-1 font-sans text-base font-bold text-ink-soft">
            {unlocked.length} of {achievements.length}
          </span>
        )}
      </h2>
      <p className="mb-4 text-sm text-ink-soft">
        Unlocked by Classic runs (in Sudoku, by every ranked board). Other modes have leaderboards of their own.
      </p>

      {isPending && <LoadingState label="Loading achievements…" className="min-h-40" />}
      {isError && <ErrorState title="Couldn't load achievements" onRetry={() => void refetch()} />}
      {achievements && (
        <div className="flex flex-col gap-5">
          {goals.length > 0 && (
            <div>
              <h3 id="next-goals-heading" className="mb-2 flex items-center gap-2 text-lg font-semibold">
                <Flag aria-hidden className="size-5 text-brand-700" />
                Next up
              </h3>
              <ul aria-labelledby="next-goals-heading" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {goals.map((goal) => (
                  <li key={goal.code} className={cardStyles('md', 'flex flex-col gap-2 ring-2 ring-brand-200')}>
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-semibold">{goal.name}</span>
                      <span className="shrink-0 text-sm font-bold text-brand-800">+{goal.xp} XP</span>
                    </div>
                    <p className="text-sm text-ink-soft">{goal.description}</p>
                    <GoalProgress achievement={goal} />
                  </li>
                ))}
              </ul>
            </div>
          )}

          {unlocked.length > 0 && locked.length > 0 && (
            <div role="group" aria-label="Filter achievements" className="flex flex-wrap gap-2">
              <FilterChip label="All" count={achievements.length} pressed={filter === 'all'} onClick={() => setFilter('all')} />
              <FilterChip
                label="Unlocked"
                count={unlocked.length}
                pressed={filter === 'unlocked'}
                onClick={() => setFilter('unlocked')}
              />
              <FilterChip label="Locked" count={locked.length} pressed={filter === 'locked'} onClick={() => setFilter('locked')} />
            </div>
          )}

          <ul aria-label="All achievements" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {shown.map((achievement) => (
              <AchievementCard key={achievement.code} achievement={achievement} />
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}

/**
 * What a measured goal counts, in the server's terms: the profile's own "Games played" counts Classic
 * runs alone, so a games-played goal says that Sudoku's boards count towards it too.
 */
const goalWords: Record<AchievementGoal, { counts: string; reached: string }> = {
  GAMES_PLAYED: {
    counts: "Counts Classic games of every game, and Sudoku's ranked boards.",
    reached: 'Reached: your next Classic game or Sudoku board unlocks it',
  },
  BEST_SCORE: {
    counts: 'Your best Classic score in this game.',
    reached: 'Reached: score it again in a Classic run to unlock it',
  },
}

/** How far a measured goal is, as a bar and in words. */
function GoalProgress({ achievement }: { achievement: MeasuredAchievement }) {
  const { progress, target } = achievement
  const left = target - progress
  const words = achievement.goal ? goalWords[achievement.goal] : undefined
  return (
    <div>
      <div
        role="progressbar"
        aria-label={`${achievement.name}: ${progress} of ${target}`}
        aria-valuemin={0}
        aria-valuemax={target}
        aria-valuenow={progress}
        className="h-2.5 overflow-hidden rounded-full bg-surface-muted"
      >
        <div
          className="h-full rounded-full bg-linear-to-r from-brand-400 to-brand-600 transition-[width] duration-500"
          style={{ width: `${(progress / target) * 100}%` }}
        />
      </div>
      <p className="mt-1 flex flex-wrap justify-between gap-x-2 text-sm font-bold text-ink-soft tabular-nums">
        <span>
          {formatScore(progress)} / {formatScore(target)}
        </span>
        <span>
          {left > 0
            ? `${formatScore(left)} to go`
            : (words?.reached ?? 'Reached: your next qualifying Classic run unlocks it')}
        </span>
      </p>
      {words && <p className="mt-0.5 text-xs text-ink-soft">{words.counts}</p>}
    </div>
  )
}

function AchievementCard({ achievement }: { achievement: AchievementStatus }) {
  const { unlocked } = achievement
  const Icon = unlocked ? Trophy : Lock

  return (
    <li className={cardStyles('md', cn('flex gap-4', !unlocked && 'bg-surface/60 shadow-none'))}>
      <span
        className={cn(
          'grid size-12 shrink-0 place-items-center rounded-2xl',
          unlocked ? 'bg-amber-400 text-amber-950 shadow-soft' : 'bg-surface-muted text-ink-soft',
        )}
      >
        <Icon aria-hidden className="size-6" />
      </span>
      <div className="min-w-0 flex-1">
        <h3 className={cn('font-semibold', !unlocked && 'text-ink-soft')}>{achievement.name}</h3>
        <p className="text-sm text-ink-soft">{achievement.description}</p>
        <p className="mt-1.5 text-sm font-bold">
          {unlocked ? (
            <span className="text-amber-700">
              Unlocked{achievement.unlockedAt ? ` ${formatDate(achievement.unlockedAt)}` : ''} · +{achievement.xp} XP · +
              {achievement.coins} coins
            </span>
          ) : (
            <span className="text-ink-soft">
              Locked · worth {achievement.xp} XP and {achievement.coins} coins
            </span>
          )}
        </p>
        {isMeasured(achievement) && (
          <div className="mt-2">
            <GoalProgress achievement={achievement} />
          </div>
        )}
      </div>
    </li>
  )
}
