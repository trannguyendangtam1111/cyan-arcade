import { Lock, Trophy } from 'lucide-react'
import { useAchievements, type AchievementStatus } from '@/api/profile'
import { cardStyles } from '@/components/ui/cardStyles'
import { ErrorState } from '@/components/ui/ErrorState'
import { LoadingState } from '@/components/ui/LoadingState'
import { cn } from '@/lib/cn'
import { formatDate } from '@/lib/format'

/** Every achievement in the arcade: the ones the player has, and the ones still to chase. */
export function AchievementGrid() {
  const { data: achievements, isPending, isError, refetch } = useAchievements(true)
  const unlocked = achievements?.filter((achievement) => achievement.unlocked).length

  return (
    <section aria-labelledby="achievements-heading">
      <h2 id="achievements-heading" className="mb-3 text-2xl font-bold">
        Achievements
        {achievements && (
          <span className="ml-2 font-sans text-base font-bold text-ink-soft">
            {unlocked} of {achievements.length}
          </span>
        )}
      </h2>

      {isPending && <LoadingState label="Loading achievements…" className="min-h-40" />}
      {isError && <ErrorState title="Couldn't load achievements" onRetry={() => void refetch()} />}
      {achievements && (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {achievements.map((achievement) => (
            <AchievementCard key={achievement.code} achievement={achievement} />
          ))}
        </ul>
      )}
    </section>
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
      <div className="min-w-0">
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
      </div>
    </li>
  )
}
