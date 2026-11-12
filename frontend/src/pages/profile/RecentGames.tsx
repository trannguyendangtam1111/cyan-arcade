import { Gamepad2 } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { CLASSIC, useGameModes } from '@/api/games'
import { modeOf } from '@/api/gameSessions'
import { useGameHistory, type GameHistoryEntry } from '@/api/profile'
import { Badge } from '@/components/ui/Badge'
import { buttonStyles } from '@/components/ui/buttonStyles'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { ErrorState } from '@/components/ui/ErrorState'
import { LoadingState } from '@/components/ui/LoadingState'
import { Pager } from '@/components/ui/Pager'
import { cn } from '@/lib/cn'
import { formatDate, formatGameTime, formatScore } from '@/lib/format'

/** The player's finished games, newest first, a page at a time. */
export function RecentGames() {
  const [page, setPage] = useState(0)
  const { data, isPending, isError, isPlaceholderData, refetch } = useGameHistory(page, true)

  return (
    <section aria-labelledby="recent-games-heading">
      <h2 id="recent-games-heading" className="mb-3 text-2xl font-bold">
        Recent games
      </h2>
      <p className="mb-3 text-sm text-ink-soft">Includes saved results from all modes.</p>

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
        <Card padding="none" className="overflow-x-auto">
          <table className={cn('w-full text-left transition-opacity', isPlaceholderData && 'opacity-50')}>
            <caption className="sr-only">Your finished games, newest first</caption>
            <thead className="text-xs font-bold tracking-wide text-ink-soft uppercase">
              <tr>
                <th scope="col" className="py-3 pl-5">
                  Game
                </th>
                <th scope="col" className="py-3 text-right">
                  Score / time
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
                <RecentGameRow key={`${data.page}-${index}`} entry={entry} />
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

/** Mode queries share the existing game cache, including repeated rows of the same game. */
function RecentGameRow({ entry }: { entry: GameHistoryEntry }) {
  const modeId = modeOf(entry)
  const classic = modeId === CLASSIC.id
  const modes = useGameModes(entry.gameSlug, { enabled: !classic })
  const mode = classic ? CLASSIC : modes.data?.find((candidate) => candidate.id === modeId)
  const timed = mode?.unit === 'MILLISECONDS'

  return (
    <tr className="border-t border-line">
      <td className="py-3 pr-2 pl-5">
        <Link to={`/games/${entry.gameSlug}`} className="rounded font-display font-semibold hover:text-brand-700">
          {entry.gameName}
        </Link>
        <div className="mt-1">
          <Badge tone="neutral" className="max-w-full text-left break-words whitespace-normal!">
            <span className="sr-only">Mode: </span>{mode?.name ?? modeId}
          </Badge>
        </div>
      </td>
      <td className="py-3 text-right tabular-nums">
        {!mode && modes.isPending ? (
          <span className="text-sm text-ink-soft">Loading result…</span>
        ) : (
          <>
            <span className="font-display text-lg font-semibold whitespace-nowrap">
              {timed ? formatGameTime(entry.score) : formatScore(entry.score)}
            </span>
            <span className="block text-xs text-ink-soft">
              {mode ? (timed ? 'Time' : 'Points') : 'Recorded value · unit unavailable'}
            </span>
          </>
        )}
        {!mode && modes.isError && (
          <button
            type="button"
            onClick={() => void modes.refetch()}
            aria-label={`Retry mode details for ${entry.gameName}`}
            className="mt-1 rounded text-xs font-bold text-brand-700 underline underline-offset-2 hover:text-brand-900"
          >
            Retry mode details
          </button>
        )}
      </td>
      <td className="hidden py-3 pl-6 sm:table-cell">
        <span className="flex flex-wrap gap-1.5">
          {entry.personalBest && <Badge tone="warning">New best</Badge>}
          <Badge tone="brand">+{entry.xpEarned} XP</Badge>
        </span>
      </td>
      <td className="py-3 pr-5 text-right text-ink-soft">{formatDate(entry.playedAt)}</td>
    </tr>
  )
}
