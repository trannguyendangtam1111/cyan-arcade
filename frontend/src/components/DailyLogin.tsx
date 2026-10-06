import { CalendarClock, Check, Gift, Package } from 'lucide-react'
import { useEffect } from 'react'
import { ApiError } from '@/api/client'
import { useClaimDailyLogin, useDailyLogin, type DailyLoginStatus } from '@/api/economy'
import { Button } from '@/components/ui/Button'
import { cardStyles } from '@/components/ui/cardStyles'
import { CoinAmount } from '@/components/ui/CoinAmount'
import { useCountdown } from '@/hooks/useCountdown'
import { cn } from '@/lib/cn'
import { formatTimeLeft } from '@/lib/format'

interface DailyLoginProps {
  /** `full` shows every day of the run; `compact` just today's reward and the button, for the home page. */
  variant?: 'full' | 'compact'
}

/**
 * The daily login reward of the signed-in player: one claim per day (the server's day, in UTC),
 * worth more for every day in a row. The amount and the day come from the server; claiming twice
 * is refused there, not just here.
 */
export function DailyLogin({ variant = 'full' }: DailyLoginProps) {
  const { data: status, isPending, isError, refetch } = useDailyLogin(true)
  const claim = useClaimDailyLogin()
  const timeLeft = useCountdown(status?.resetsAt)
  // A new day has started since this was read: ask again (the server decides when that is), so
  // today's reward appears.
  const dayOver = timeLeft === 0 && status?.claimedToday === true
  useEffect(() => {
    if (!dayOver) return
    void refetch()
    const timer = window.setInterval(() => void refetch(), 30_000)
    return () => window.clearInterval(timer)
  }, [dayOver, refetch])

  const today = status?.days.find((day) => day.day === status.day)
  const justClaimed = claim.data && status?.claimedToday ? claim.data : null
  const error =
    claim.error instanceof ApiError ? claim.error.message : claim.error ? "Couldn't claim the reward. Try again." : null

  return (
    <section
      aria-labelledby="daily-login-heading"
      className={cardStyles('md', cn('flex flex-col gap-4 bg-linear-to-br from-amber-50 to-surface', variant === 'compact' && 'h-full'))}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="daily-login-heading" className="flex items-center gap-2.5 text-xl font-bold">
          <span className="grid size-10 place-items-center rounded-2xl bg-amber-400 text-amber-950 shadow-soft">
            <Gift aria-hidden className="size-5.5" strokeWidth={2.5} />
          </span>
          Daily reward
        </h2>
        {status && status.streak > 0 && (
          <p className="rounded-full bg-orange-100 px-3 py-1 text-sm font-bold text-orange-800">
            {status.streak} {status.streak === 1 ? 'day' : 'days'} in a row
          </p>
        )}
      </div>

      {isPending && <p className="text-ink-soft">Loading your reward…</p>}
      {isError && !status && (
        <p className="text-ink-soft">
          Your daily reward couldn't be loaded.{' '}
          <button type="button" className="font-bold text-brand-700" onClick={() => void refetch()}>
            Try again
          </button>
        </p>
      )}

      {status && variant === 'full' && (
        <>
          <DayTrack status={status} />
          <RewardPreview status={status} />
        </>
      )}

      {status && (
        <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-2">
          {status.claimedToday ? (
            <p className="inline-flex items-center gap-1.5 font-display font-semibold text-emerald-700">
              <Check aria-hidden className="size-5" strokeWidth={3} />
              Claimed today
              {timeLeft !== null && timeLeft > 0 && (
                <span className="inline-flex items-center gap-1 font-sans text-sm font-bold text-ink-soft">
                  <CalendarClock aria-hidden className="size-4" />
                  next in {formatTimeLeft(timeLeft)}
                </span>
              )}
            </p>
          ) : (
            <Button onClick={() => claim.mutate()} disabled={claim.isPending} className="bg-amber-400 shadow-[0_4px_0_0_var(--color-amber-600)] hover:bg-amber-300 hover:shadow-[0_6px_0_0_var(--color-amber-600)]">
              <Gift aria-hidden className="size-5" />
              {today ? (
                <>
                  Claim day {today.day}:
                  <CoinAmount amount={today.coins} />
                </>
              ) : (
                'Claim'
              )}
            </Button>
          )}
          {today?.bonusItem && !status.claimedToday && (
            <p className="inline-flex items-center gap-1 text-sm font-bold text-purple-700">
              <Package aria-hidden className="size-4" />+ {today.bonusItem}
            </p>
          )}
        </div>
      )}

      <div aria-live="polite">
        {justClaimed && (
          <p role="status" className="font-display font-semibold text-amber-900 motion-safe:animate-pop-in">
            +{justClaimed.coins} coins{justClaimed.bonusItem ? ` and an ${justClaimed.bonusItem}` : ''}! You now have{' '}
            {justClaimed.balance}.
          </p>
        )}
        {error && (
          <p role="alert" className="font-bold text-rose-700">
            {error}
          </p>
        )}
      </div>
    </section>
  )
}

/**
 * Today's reward (or, once claimed, tomorrow's) and the big one at the end of the run, in words.
 * All from the server's status: it knows which day of the run today is.
 */
function RewardPreview({ status }: { status: DailyLoginStatus }) {
  const today = status.days.find((day) => day.day === status.day)
  const next = status.claimedToday ? status.days.find((day) => day.day === (status.day % status.days.length) + 1) : today
  const bonusDay = status.days.find((day) => day.bonusItem)
  if (!next) return null

  return (
    <dl className="grid gap-2 text-sm sm:grid-cols-2">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-control bg-surface px-3 py-2 ring-2 ring-line">
        <dt className="font-bold text-ink-soft">{status.claimedToday ? 'Next reward' : "Today's reward"}</dt>
        <dd className="flex flex-wrap items-center gap-1.5 font-display font-semibold">
          Day {next.day}
          <CoinAmount amount={next.coins} signed />
          {next.bonusItem && <span className="text-purple-700">+ free {next.bonusItem}</span>}
          {status.claimedToday && <span className="font-sans font-bold text-ink-soft">tomorrow</span>}
        </dd>
      </div>
      {bonusDay && bonusDay.day !== next.day && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-control bg-purple-50 px-3 py-2 ring-2 ring-purple-200">
          <dt className="font-bold text-purple-800">Day {bonusDay.day} bonus</dt>
          <dd className="flex flex-wrap items-center gap-1.5 font-display font-semibold">
            <CoinAmount amount={bonusDay.coins} signed />
            <span className="text-purple-700">+ free {bonusDay.bonusItem}</span>
          </dd>
        </div>
      )}
    </dl>
  )
}

/** Every day of the run: claimed, today's, and what is still to come. */
function DayTrack({ status }: { status: DailyLoginStatus }) {
  return (
    <ol aria-label="Daily rewards" className="grid grid-cols-4 gap-2 sm:grid-cols-7">
      {status.days.map((day) => {
        const claimed = day.state === 'CLAIMED'
        const isToday = day.state === 'TODAY'
        return (
          <li
            key={day.day}
            aria-current={isToday ? 'date' : undefined}
            className={cn(
              'flex flex-col items-center gap-1 rounded-control px-1 py-2 text-center ring-2 transition-all',
              claimed && 'bg-emerald-50 ring-emerald-200',
              isToday && 'bg-amber-100 ring-amber-400 motion-safe:animate-pop-in',
              day.state === 'UPCOMING' && 'bg-surface ring-line',
              day.bonusItem && 'col-span-2 sm:col-span-1',
            )}
          >
            <span className="text-xs font-bold tracking-wide text-ink-soft uppercase">Day {day.day}</span>
            <CoinAmount amount={day.coins} className="text-sm" />
            {day.bonusItem && (
              <span className="inline-flex items-center gap-0.5 text-xs font-bold text-purple-700">
                <Package aria-hidden className="size-3.5" />+ free pack
              </span>
            )}
            {claimed && (
              <span className="inline-flex items-center text-xs font-bold text-emerald-700">
                <Check aria-hidden className="size-3.5" strokeWidth={3} />
                Claimed
              </span>
            )}
          </li>
        )
      })}
    </ol>
  )
}
