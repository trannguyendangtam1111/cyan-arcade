import { CalendarClock, Infinity as Unlimited, Package, PackageOpen } from 'lucide-react'
import { Link } from 'react-router'
import { useInventory } from '@/api/economy'
import { buttonStyles } from '@/components/ui/buttonStyles'
import { cardStyles } from '@/components/ui/cardStyles'
import { useCountdown } from '@/hooks/useCountdown'
import { formatTimeLeft } from '@/lib/format'
import { useAllowance } from '../api'

/**
 * How packs work for this player today: the free daily ones first, then the ones they bought.
 * Shown in the shop, next to the packs for sale; it is the card game's, as the daily allowance is.
 * Both numbers are the server's (the card game's allowance and the shop's inventory); this only
 * explains them.
 */
export function PackAllowancePanel() {
  const allowance = useAllowance(true)
  const inventory = useInventory(true)
  const timeLeft = useCountdown(allowance.data?.resetsAt)
  if (!allowance.data) return null

  const { dailyLimit, openedToday, leftToday } = allowance.data
  // The allowance leaves bought packs out when there is no limit, since they are not needed then.
  const bought = inventory.data?.bonusPacks ?? allowance.data.bonusPacks
  const used = dailyLimit === null ? openedToday : Math.min(openedToday, dailyLimit)

  return (
    <section
      aria-labelledby="pack-allowance-heading"
      className={cardStyles('md', 'flex flex-col gap-4 bg-linear-to-br from-purple-50 to-surface')}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="pack-allowance-heading" className="flex items-center gap-2.5 text-xl font-bold">
          <span className="grid size-10 place-items-center rounded-2xl bg-purple-500 text-white shadow-soft">
            <PackageOpen aria-hidden className="size-5.5" />
          </span>
          Your packs today
        </h2>
        <Link to="/tcg" className={buttonStyles('secondary', 'sm')}>
          Open packs
        </Link>
      </div>

      <dl className="grid gap-3 sm:grid-cols-2">
        {dailyLimit === null ? (
          <div className="rounded-control bg-surface p-4 ring-2 ring-purple-200">
            <dt className="flex items-center gap-1.5 text-sm font-bold text-ink-soft">
              <Unlimited aria-hidden className="size-4" />
              Free packs
            </dt>
            <dd className="mt-1 font-display text-lg font-semibold">Unlimited as an admin</dd>
            <dd className="text-sm text-ink-soft">{openedToday} opened today. Your bought packs stay saved.</dd>
          </div>
        ) : (
          <div className="rounded-control bg-surface p-4 ring-2 ring-purple-200">
            <dt className="flex items-center gap-1.5 text-sm font-bold text-ink-soft">
              <CalendarClock aria-hidden className="size-4" />
              Daily free packs used
            </dt>
            <dd className="mt-1 font-display text-lg font-semibold tabular-nums">
              {used}/{dailyLimit}
            </dd>
            <dd>
              <div
                role="progressbar"
                aria-label={`Daily free packs used: ${used} of ${dailyLimit}`}
                aria-valuemin={0}
                aria-valuemax={dailyLimit}
                aria-valuenow={used}
                className="mt-1 h-2.5 overflow-hidden rounded-full bg-surface-muted"
              >
                <div className="h-full rounded-full bg-purple-500" style={{ width: `${(used / dailyLimit) * 100}%` }} />
              </div>
            </dd>
            <dd className="mt-1 text-sm text-ink-soft">
              {leftToday ? `${leftToday} free ${leftToday === 1 ? 'pack' : 'packs'} left today.` : 'All used for today.'}
              {timeLeft !== null && timeLeft > 0 && ` New ones in ${formatTimeLeft(timeLeft)}.`}
            </dd>
          </div>
        )}
        <div className="rounded-control bg-surface p-4 ring-2 ring-purple-200">
          <dt className="flex items-center gap-1.5 text-sm font-bold text-ink-soft">
            <Package aria-hidden className="size-4" />
            Bought packs available
          </dt>
          <dd className="mt-1 font-display text-lg font-semibold tabular-nums">{bought}</dd>
          <dd className="text-sm text-ink-soft">
            {dailyLimit === null
              ? 'Kept for later: admins never need them.'
              : "Opened only once today's free packs are used up."}
          </dd>
        </div>
      </dl>
    </section>
  )
}
