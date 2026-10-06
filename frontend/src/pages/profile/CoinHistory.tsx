import { CalendarCheck, Gamepad2, Gift, ShoppingBag, Target, Trophy, Zap, type LucideIcon } from 'lucide-react'
import { useState } from 'react'
import { useTransactions, type CoinTransactionType } from '@/api/economy'
import { Card } from '@/components/ui/Card'
import { CoinAmount } from '@/components/ui/CoinAmount'
import { ErrorState } from '@/components/ui/ErrorState'
import { LoadingState } from '@/components/ui/LoadingState'
import { Pager } from '@/components/ui/Pager'
import { cn } from '@/lib/cn'
import { formatDate, formatScore } from '@/lib/format'

/** Where coins came from (or went), as a player would say it. */
const sources: Record<CoinTransactionType, { label: string; icon: LucideIcon; tone: string }> = {
  GAME_COMPLETION: { label: 'Game played', icon: Gamepad2, tone: 'bg-brand-100 text-brand-800' },
  HIGH_SCORE: { label: 'New personal best', icon: Zap, tone: 'bg-orange-100 text-orange-800' },
  ACHIEVEMENT: { label: 'Achievement', icon: Trophy, tone: 'bg-amber-100 text-amber-800' },
  DAILY_CHALLENGE: { label: 'Daily challenge', icon: Target, tone: 'bg-rose-100 text-rose-800' },
  DAILY_LOGIN: { label: 'Daily reward', icon: CalendarCheck, tone: 'bg-emerald-100 text-emerald-800' },
  SHOP_PURCHASE: { label: 'Shop', icon: ShoppingBag, tone: 'bg-purple-100 text-purple-800' },
  ADMIN_GRANT: { label: 'Gift', icon: Gift, tone: 'bg-sky-100 text-sky-800' },
}

/**
 * Every coin the player earned or spent, newest first, and why: the ledger, as the player sees it.
 * Only the player's own; it never shows on the public profile.
 */
export function CoinHistory() {
  const [page, setPage] = useState(0)
  const { data, isPending, isError, isPlaceholderData, refetch } = useTransactions(page, true)

  return (
    <section aria-labelledby="coin-history-heading">
      <h2 id="coin-history-heading" className="mb-3 text-2xl font-bold">
        Coin history
      </h2>
      {isPending && <LoadingState label="Loading your coins…" className="min-h-40" />}
      {isError && <ErrorState title="Couldn't load your coins" onRetry={() => void refetch()} />}
      {data?.totalEntries === 0 && (
        <Card className="text-ink-soft">No coins yet. Finish a game, a challenge or claim your daily reward to earn some.</Card>
      )}
      {data && data.totalEntries > 0 && (
        <Card padding="none" className="overflow-hidden">
          <ul className={cn('divide-y divide-line transition-opacity', isPlaceholderData && 'opacity-50')}>
            {data.entries.map((entry) => {
              const source = sources[entry.type] ?? { label: entry.type, icon: Gift, tone: 'bg-surface-muted text-ink-soft' }
              return (
                <li key={entry.id} className="flex items-center gap-3 px-4 py-3 sm:px-5">
                  <span className={cn('grid size-9 shrink-0 place-items-center rounded-xl', source.tone)}>
                    <source.icon aria-hidden className="size-4.5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-display font-semibold">{entry.description}</span>
                    <span className="block text-xs font-bold tracking-wide text-ink-soft uppercase">
                      {source.label} · {formatDate(entry.createdAt)}
                    </span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end">
                    <CoinAmount
                      amount={entry.amount}
                      signed
                      className={entry.amount < 0 ? 'text-rose-700' : 'text-emerald-700'}
                    />
                    <span className="hidden text-xs text-ink-soft tabular-nums sm:block">
                      Balance {formatScore(entry.balanceAfter)}
                    </span>
                  </span>
                </li>
              )
            })}
          </ul>
          <Pager
            label="Coin history pages"
            page={page + 1}
            totalPages={data.totalPages}
            onPageChange={(next) => setPage(next - 1)}
            previousLabel="Newer"
            nextLabel="Older"
            className="border-t border-line px-5 py-3"
          />
        </Card>
      )}
    </section>
  )
}
