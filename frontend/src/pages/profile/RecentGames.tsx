import { Gamepad2 } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { useGameHistory } from '@/api/profile'
import { Badge } from '@/components/ui/Badge'
import { buttonStyles } from '@/components/ui/buttonStyles'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { ErrorState } from '@/components/ui/ErrorState'
import { LoadingState } from '@/components/ui/LoadingState'
import { Pager } from '@/components/ui/Pager'
import { cn } from '@/lib/cn'
import { formatDate, formatScore } from '@/lib/format'

/** The player's finished games, newest first, a page at a time. */
export function RecentGames() {
  const [page, setPage] = useState(0)
  const { data, isPending, isError, isPlaceholderData, refetch } = useGameHistory(page, true)

  return (
    <section aria-labelledby="recent-games-heading">
      <h2 id="recent-games-heading" className="mb-3 text-2xl font-bold">
        Recent games
      </h2>

      {isPending && <LoadingState label="Loading your games…" className="min-h-40" />}
      {isError && <ErrorState title="Couldn't load your games" onRetry={() => void refetch()} />}
      {data?.totalEntries === 0 && (
        <EmptyState
          icon={Gamepad2}
          title="No games yet"
          description="Finish a game while signed in and it will show up here."
          action={
            <Link to="/games" className={buttonStyles('primary')}>
              Browse games
            </Link>
          }
        />
      )}

      {data && data.totalEntries > 0 && (
        <Card padding="none" className="overflow-hidden">
          <table className={cn('w-full text-left transition-opacity', isPlaceholderData && 'opacity-50')}>
            <caption className="sr-only">Your finished games, newest first</caption>
            <thead className="text-xs font-bold tracking-wide text-ink-soft uppercase">
              <tr>
                <th scope="col" className="py-3 pl-5">
                  Game
                </th>
                <th scope="col" className="py-3 text-right">
                  Score
                </th>
                <th scope="col" className="hidden py-3 pl-6 sm:table-cell">
                  Result
                </th>
                <th scope="col" className="py-3 pr-5 text-right">
                  Date
                </th>
              </tr>
            </thead>
            <tbody>
              {data.entries.map((entry, index) => (
                <tr key={`${data.page}-${index}`} className="border-t border-line">
                  <td className="py-3 pl-5">
                    <Link
                      to={`/games/${entry.gameSlug}`}
                      className="rounded font-display font-semibold hover:text-brand-700"
                    >
                      {entry.gameName}
                    </Link>
                  </td>
                  <td className="py-3 text-right font-display text-lg font-semibold tabular-nums">
                    {formatScore(entry.score)}
                  </td>
                  <td className="hidden py-3 pl-6 sm:table-cell">
                    <span className="flex flex-wrap gap-1.5">
                      {entry.personalBest && <Badge tone="warning">New best</Badge>}
                      <Badge tone="brand">+{entry.xpEarned} XP</Badge>
                    </span>
                  </td>
                  <td className="py-3 pr-5 text-right text-ink-soft">{formatDate(entry.playedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <Pager
            label="Game history pages"
            page={data.page + 1}
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
