import { ArrowRight, ShoppingBag } from 'lucide-react'
import { Link } from 'react-router'
import { useCoins } from '@/api/economy'
import { useProfile } from '@/api/profile'
import { DailyLogin } from '@/components/DailyLogin'
import { cardStyles } from '@/components/ui/cardStyles'
import { CoinAmount } from '@/components/ui/CoinAmount'

/**
 * The signed-in player's corner of the home page: their coins and level, and today's login
 * reward. Two big tiles rather than a wall of numbers; the profile has the rest.
 */
export function PlayerStrip() {
  const { data: coins } = useCoins(true)
  const { data: profile } = useProfile(true)
  const percent = profile ? Math.round((profile.xpIntoLevel / profile.xpForNextLevel) * 100) : 0

  return (
    <section aria-label="Your progress" className="grid gap-5 md:grid-cols-2">
      <div className={cardStyles('md', 'flex flex-col gap-4 bg-linear-to-br from-brand-50 to-surface')}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm font-bold tracking-wide text-ink-soft uppercase">Your coins</p>
          {profile && (
            <p className="rounded-full bg-brand-100 px-3 py-1 text-sm font-bold text-brand-800">Level {profile.level}</p>
          )}
        </div>
        <CoinAmount amount={coins?.balance ?? 0} className="text-4xl text-amber-900 [&>span:first-child]:size-9 [&>span:first-child]:text-base" />
        {profile && (
          <div>
            <div
              role="progressbar"
              aria-label={`Progress to level ${profile.level + 1}`}
              aria-valuemin={0}
              aria-valuemax={profile.xpForNextLevel}
              aria-valuenow={profile.xpIntoLevel}
              className="h-3 overflow-hidden rounded-full bg-surface-muted"
            >
              <div className="h-full rounded-full bg-linear-to-r from-brand-400 to-brand-600" style={{ width: `${percent}%` }} />
            </div>
            <p className="mt-1 text-sm text-ink-soft">
              {profile.xpForNextLevel - profile.xpIntoLevel} XP to level {profile.level + 1}
            </p>
          </div>
        )}
        <Link
          to="/shop"
          className="group mt-auto inline-flex items-center gap-1.5 self-start rounded font-display font-semibold text-purple-700 hover:text-purple-900"
        >
          <ShoppingBag aria-hidden className="size-4" />
          Spend them in the shop
          <ArrowRight aria-hidden className="size-4 transition-transform group-hover:translate-x-1" />
        </Link>
      </div>
      <DailyLogin variant="compact" />
    </section>
  )
}
