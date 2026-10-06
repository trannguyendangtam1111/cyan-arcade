import { ArrowRight, CalendarClock, CircleCheck, RotateCcw, Target, Zap } from 'lucide-react'
import { useEffect, type CSSProperties } from 'react'
import { Link } from 'react-router'
import { TCG_PACK_OPENED, useDailyChallenges, type DailyChallenge } from '@/api/dailyChallenges'
import { Badge } from '@/components/ui/Badge'
import { CoinAmount } from '@/components/ui/CoinAmount'
import { cardStyles, interactiveCard } from '@/components/ui/cardStyles'
import { useCountdown } from '@/hooks/useCountdown'
import { useGameCatalog } from '@/hooks/useGameCatalog'
import { accentStyle } from '@/lib/accent'
import { cn } from '@/lib/cn'
import { formatTimeLeft } from '@/lib/format'

/**
 * Today's daily challenges, for the hub. Signed-in players see what they have completed; guests
 * see what there is to win and how to start earning it.
 */
export function DailyChallenges() {
  const { data, isPending, isError, refetch, signedIn } = useDailyChallenges()
  const { games } = useGameCatalog()
  const timeLeft = useCountdown(data?.resetsAt)

  // Once the day is over the list on screen is yesterday's: ask for the new one, and keep asking
  // until the server has moved on too (its clock, not this device's, decides when that is).
  const expired = timeLeft === 0
  useEffect(() => {
    if (!expired) return
    void refetch()
    const timer = window.setInterval(() => void refetch(), RETRY_AFTER_RESET_MS)
    return () => window.clearInterval(timer)
  }, [expired, refetch])

  const accentOf = (challenge: DailyChallenge) =>
    challenge.game ? games?.find((game) => game.slug === challenge.game?.slug)?.accentColor : activityOf(challenge).accent

  return (
    <section aria-labelledby="daily-challenges-heading">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <h2 id="daily-challenges-heading" className="flex items-center gap-2.5 text-2xl font-bold sm:text-3xl">
          <span className="grid size-10 place-items-center rounded-2xl bg-orange-500 text-white shadow-soft">
            <Target aria-hidden className="size-5.5" strokeWidth={2.5} />
          </span>
          Daily challenges
        </h2>
        {data && (
          <p className="flex flex-wrap items-center gap-2 text-sm font-bold text-ink-soft">
            {signedIn && data.challenges.length > 0 && (
              <Badge tone={data.completedCount === data.challenges.length ? 'success' : 'brand'} className="px-3 py-1 text-sm">
                {data.completedCount ?? 0} of {data.challenges.length} done
              </Badge>
            )}
            {timeLeft !== null && (
              <span className="inline-flex items-center gap-1.5">
                <CalendarClock aria-hidden className="size-4" />
                {expired ? 'New challenges any moment' : `New challenges in ${formatTimeLeft(timeLeft)}`}
              </span>
            )}
          </p>
        )}
      </div>

      {isPending && (
        <div role="status" aria-label="Loading daily challenges" className={gridStyles}>
          {Array.from({ length: 3 }, (_, index) => (
            <ChallengeSkeleton key={index} />
          ))}
        </div>
      )}

      {isError && !data && (
        <p className={cardStyles('md', 'flex flex-wrap items-center gap-x-3 gap-y-2 text-ink-soft')}>
          Today's challenges couldn't be loaded.
          <button
            type="button"
            onClick={() => void refetch()}
            className="inline-flex items-center gap-1.5 rounded font-bold text-brand-700 hover:text-brand-900"
          >
            <RotateCcw aria-hidden className="size-4" />
            Reload challenges
          </button>
        </p>
      )}

      {data?.challenges.length === 0 && (
        <p className={cardStyles('md', 'text-ink-soft')}>
          <strong className="text-ink">No challenges today.</strong> A fresh set arrives at midnight (UTC).
        </p>
      )}

      {data && data.challenges.length > 0 && (
        <>
          <ul className={gridStyles}>
            {data.challenges.map((challenge, index) => (
              <li key={challenge.id} className="flex *:w-full">
                <ChallengeCard challenge={challenge} accentColor={accentOf(challenge)} index={index} />
              </li>
            ))}
          </ul>
          {!signedIn && (
            <p className="mt-4 text-ink-soft">
              <Link to="/login?redirect=%2F" className="rounded font-bold text-brand-700 hover:text-brand-900">
                Log in
              </Link>{' '}
              or{' '}
              <Link to="/register?redirect=%2F" className="rounded font-bold text-brand-700 hover:text-brand-900">
                create an account
              </Link>{' '}
              to earn these rewards.
            </p>
          )}
        </>
      )}
    </section>
  )
}

const gridStyles = 'grid gap-4 sm:grid-cols-2 xl:grid-cols-4'

/** Where an activity's challenge is done, and its color. The card game is the only activity so far. */
const activities: Record<string, { to: string; cta: string; accent: string }> = {
  [TCG_PACK_OPENED]: { to: '/tcg', cta: 'Open packs', accent: '#9333ea' },
}

function activityOf(challenge: DailyChallenge) {
  return activities[challenge.activity?.code ?? ''] ?? { to: '/', cta: 'Go', accent: '#f97316' }
}

const RETRY_AFTER_RESET_MS = 30_000

interface ChallengeCardProps {
  challenge: DailyChallenge
  /** The game's color, once the catalog has loaded. The brand color stands in until then. */
  accentColor: string | undefined
  index: number
}

/** One challenge. The whole card leads to where it is done: its game, or the activity it counts. */
function ChallengeCard({ challenge, accentColor, index }: ChallengeCardProps) {
  const done = challenge.completed === true
  const where = challenge.game
    ? { to: `/games/${challenge.game.slug}`, label: challenge.game.name, cta: `Play ${challenge.game.name}` }
    : { ...activityOf(challenge), label: challenge.activity?.name ?? 'Challenge' }
  const progress = typeof challenge.progress === 'number' ? Math.min(challenge.progress, challenge.target) : null
  const style: CSSProperties = { animationDelay: `${index * 70}ms`, ...(accentColor && accentStyle(accentColor)) }

  return (
    <Link
      to={where.to}
      style={style}
      className={cardStyles(
        'none',
        cn(
          'group flex flex-col gap-3 overflow-hidden border-l-8 border-(--accent) p-5 motion-safe:animate-pop-in',
          interactiveCard,
          done && 'bg-emerald-50',
        ),
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <Badge tone="accent">{where.label}</Badge>
        <span className="flex flex-wrap justify-end gap-1.5">
          <span className="inline-flex items-center gap-1 rounded-full bg-brand-100 px-2.5 py-0.5 text-sm font-bold text-brand-800">
            <Zap aria-hidden className="size-3.5" fill="currentColor" />+{challenge.xpReward} XP
          </span>
          {challenge.coinReward > 0 && (
            <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-sm text-amber-900">
              <CoinAmount amount={challenge.coinReward} signed />
            </span>
          )}
        </span>
      </div>

      <div>
        <h3 className="text-lg font-semibold">{challenge.title}</h3>
        <p className="mt-0.5 text-ink-soft">{challenge.description}</p>
      </div>

      {progress !== null && !done && (
        <div>
          <div
            role="progressbar"
            aria-label={`Progress: ${progress} of ${challenge.target}`}
            aria-valuemin={0}
            aria-valuemax={challenge.target}
            aria-valuenow={progress}
            className="h-2.5 overflow-hidden rounded-full bg-surface-muted"
          >
            <div className="h-full rounded-full bg-(--accent) transition-[width] duration-500" style={{ width: `${(progress / challenge.target) * 100}%` }} />
          </div>
          <p className="mt-1 text-sm font-bold text-ink-soft tabular-nums">
            {progress} / {challenge.target}
          </p>
        </div>
      )}

      <p className="mt-auto pt-1 font-display text-sm font-semibold">
        {done ? (
          <span className="inline-flex items-center gap-1.5 text-emerald-700">
            <CircleCheck aria-hidden className="size-4.5" />
            Completed
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-brand-700">
            {where.cta}
            <ArrowRight aria-hidden className="size-4 transition-transform group-hover:translate-x-1" />
          </span>
        )}
      </p>
    </Link>
  )
}

function ChallengeSkeleton() {
  return (
    <div aria-hidden className={cardStyles('md', 'flex flex-col gap-3')}>
      <div className="flex justify-between">
        <div className="h-5 w-16 animate-pulse rounded-full bg-surface-muted" />
        <div className="h-5 w-14 animate-pulse rounded-full bg-surface-muted" />
      </div>
      <div className="h-5 w-2/5 animate-pulse rounded-full bg-surface-muted" />
      <div className="h-4 w-4/5 animate-pulse rounded-full bg-surface-muted" />
      <div className="mt-1 h-4 w-24 animate-pulse rounded-full bg-surface-muted" />
    </div>
  )
}
