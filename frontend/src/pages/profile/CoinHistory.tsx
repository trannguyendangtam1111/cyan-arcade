import { useState } from 'react'
import { useTransactions, type CoinTransactionType } from '@/api/economy'
import { Card } from '@/components/ui/Card'
import { CoinAmount } from '@/components/ui/CoinAmount'
import { ErrorState } from '@/components/ui/ErrorState'
import { LoadingState } from '@/components/ui/LoadingState'
import { Pager } from '@/components/ui/Pager'
import { cn } from '@/lib/cn'
import { formatDate } from '@/lib/format'

const typeLabels: Record<CoinTransactionType, string> = {
  GAME_COMPLETION: 'Game',
  HIGH_SCORE: 'New best',
  ACHIEVEMENT: 'Achievement',
  DAILY_CHALLENGE: 'Challenge',
  DAILY_LOGIN: 'Daily reward',
  SHOP_PURCHASE: 'Shop',
  ADMIN_GRANT: 'Gift',
}

/** Every coin the player earned or spent, newest first: the ledger, as the player sees it. */
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
            {data.entries.map((entry) => (
              <li key={entry.id} className="flex items-center gap-3 px-5 py-3">
                <span className="w-24 shrink-0 text-xs font-bold tracking-wide text-ink-soft uppercase">
                  {typeLabels[entry.type] ?? entry.type}
                </span>
                <span className="min-w-0 flex-1 truncate">{entry.description}</span>
                <span className="hidden text-sm text-ink-soft sm:inline">{formatDate(entry.createdAt)}</span>
                <CoinAmount
                  amount={entry.amount}
                  signed
                  className={cn('w-20 justify-end', entry.amount < 0 ? 'text-rose-700' : 'text-emerald-700')}
                />
              </li>
            ))}
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
