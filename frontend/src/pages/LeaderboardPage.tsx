import { Medal, Sparkles, Trophy } from 'lucide-react'
import { Link, useSearchParams } from 'react-router'
import { useLeaderboard, type LeaderboardEntry, type LeaderboardResponse } from '@/api/leaderboards'
import { Avatar } from '@/components/ui/Avatar'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { buttonStyles } from '@/components/ui/buttonStyles'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { ErrorState } from '@/components/ui/ErrorState'
import { LoadingState } from '@/components/ui/LoadingState'
import { PageHeader } from '@/components/ui/PageHeader'
import { Pager } from '@/components/ui/Pager'
import { RankBadge } from '@/components/ui/RankBadge'
import type { GameDefinition } from '@/games/types'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { useGameCatalog } from '@/hooks/useGameCatalog'
import { accentStyle } from '@/lib/accent'
import { cn } from '@/lib/cn'
import { formatDate, formatDuration, formatScore } from '@/lib/format'

/**
 * Top scores per game. The selected game and page live in the URL (`?game=2048&page=2`), so a
 * leaderboard can be linked to and survives a reload.
 */
export function LeaderboardPage() {
  useDocumentTitle('Leaderboard')
  const [params, setParams] = useSearchParams()
  const { games, isPending, isError, refetch } = useGameCatalog()

  const selected = games?.find((game) => game.slug === params.get('game')) ?? games?.[0]
  // Pages are 1-based in the URL because people read it, and 0-based in the API.
  const page = Math.max(1, Math.floor(Number(params.get('page'))) || 1)

  return (
    <>
      <PageHeader icon={Trophy} title="Leaderboard" description="The best runs in the arcade, game by game." />

      {isPending && <LoadingState label="Loading games…" />}
      {isError && <ErrorState title="Couldn't load the games" onRetry={() => void refetch()} />}
      {games?.length === 0 && (
        <EmptyState icon={Sparkles} title="No games yet" description="Leaderboards appear once the arcade has games." />
      )}

      {games && selected && (
        <div style={accentStyle(selected.accentColor)}>
          <div role="group" aria-label="Choose a game" className="mb-6 flex flex-wrap gap-2">
            {games.map((game) => {
              const isSelected = game.slug === selected.slug
              return (
                <button
                  key={game.slug}
                  type="button"
                  aria-pressed={isSelected}
                  onClick={() => setParams({ game: game.slug })}
                  style={accentStyle(game.accentColor)}
                  className={cn(
                    'rounded-full px-4 py-2 font-display font-medium ring-2 transition-all active:scale-95',
                    isSelected
                      ? 'bg-(--accent) text-(--accent-ink) ring-(--accent)'
                      : 'bg-surface text-ink-soft ring-line hover:text-ink hover:ring-(--accent)',
                  )}
                >
                  {game.name}
                </button>
              )
            })}
          </div>

          <GameLeaderboard
            // A different game is a different board: start it clean rather than showing stale rows.
            key={selected.slug}
            game={selected}
            page={page}
            onPageChange={(next) => setParams({ game: selected.slug, page: String(next) })}
          />
        </div>
      )}
    </>
  )
}

interface GameLeaderboardProps {
  game: GameDefinition
  /** 1-based. */
  page: number
  onPageChange: (page: number) => void
}

function GameLeaderboard({ game, page, onPageChange }: GameLeaderboardProps) {
  const { data, isPending, isError, isPlaceholderData, refetch } = useLeaderboard(game.slug, page - 1)

  if (isPending) return <LeaderboardSkeleton />
  if (isError) return <ErrorState title="Couldn't load this leaderboard" onRetry={() => void refetch()} />

  if (data.totalEntries === 0) {
    return (
      <EmptyState
        icon={Medal}
        title="No scores yet"
        description={`Nobody has finished a game of ${game.name} yet. The top spot is yours for the taking.`}
        action={
          <Link to={`/games/${game.slug}`} className={buttonStyles('primary')}>
            Play {game.name}
          </Link>
        }
      />
    )
  }

  return (
    <Card padding="none" className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
        <h2 className="text-xl font-semibold">{game.name}</h2>
        <PlayerSummary data={data} game={game} />
      </div>

      {data.entries.length === 0 ? (
        <div className="flex flex-col items-center gap-3 px-5 py-10 text-center text-ink-soft">
          <p>There are no scores on this page.</p>
          <Button variant="secondary" size="sm" onClick={() => onPageChange(1)}>
            Back to the top
          </Button>
        </div>
      ) : (
        <table className={cn('w-full text-left transition-opacity', isPlaceholderData && 'opacity-50')}>
          <caption className="sr-only">
            {game.name} leaderboard, page {data.page + 1} of {data.totalPages}
          </caption>
          <thead className="text-xs font-bold tracking-wide text-ink-soft uppercase">
            <tr>
              <th scope="col" className="w-20 py-3 pl-5">
                Rank
              </th>
              <th scope="col" className="py-3">
                Player
              </th>
              <th scope="col" className="py-3 pr-5 text-right sm:pr-3">
                Score
              </th>
              <th scope="col" className="hidden py-3 text-right sm:table-cell">
                Time
              </th>
              <th scope="col" className="hidden py-3 pr-5 text-right md:table-cell">
                Date
              </th>
            </tr>
          </thead>
          <tbody>
            {data.entries.map((entry, index) => (
              <LeaderboardRow key={`${data.page}-${index}`} entry={entry} />
            ))}
          </tbody>
        </table>
      )}

      <Pager
        label="Leaderboard pages"
        page={page}
        totalPages={data.totalPages}
        onPageChange={onPageChange}
        className="border-t border-line px-5 py-3"
      />
    </Card>
  )
}

/** The player's own standing, or an invitation to get on the board. */
function PlayerSummary({ data, game }: { data: LeaderboardResponse; game: GameDefinition }) {
  if (!data.player) {
    return (
      <Link to={`/games/${game.slug}`} className="rounded font-bold text-brand-700 hover:text-brand-900">
        Play to get on the board →
      </Link>
    )
  }
  return (
    <p className="rounded-full bg-(--accent)/12 px-4 py-1.5 text-sm ring-1 ring-(--accent)/40">
      Your best: <strong>{formatScore(data.player.bestScore)}</strong> · rank{' '}
      <strong>#{data.player.rank}</strong>
    </p>
  )
}

function LeaderboardRow({ entry }: { entry: LeaderboardEntry }) {
  return (
    <tr className={cn('border-t border-line', entry.you && 'bg-(--accent)/10')}>
      <td className="py-3 pl-5">
        <RankBadge rank={entry.rank} />
      </td>
      <td className="py-3">
        <span className="flex items-center gap-2">
          {entry.player ? (
            <>
              <Avatar avatar={entry.player.avatar} size="sm" />
              <span className="truncate font-bold">{entry.player.username}</span>
            </>
          ) : (
            <span className="text-ink-soft">Guest</span>
          )}
          {entry.you && <Badge tone="accent">You</Badge>}
        </span>
      </td>
      <td className="py-3 pr-5 text-right font-display text-lg font-semibold tabular-nums sm:pr-3">
        {formatScore(entry.score)}
      </td>
      <td className="hidden py-3 text-right text-ink-soft tabular-nums sm:table-cell">
        {formatDuration(entry.durationMs)}
      </td>
      <td className="hidden py-3 pr-5 text-right text-ink-soft md:table-cell">{formatDate(entry.achievedAt)}</td>
    </tr>
  )
}

function LeaderboardSkeleton() {
  return (
    <Card padding="none" role="status" aria-label="Loading leaderboard" className="overflow-hidden">
      {Array.from({ length: 6 }, (_, index) => (
        <div key={index} className="flex items-center gap-4 border-b border-line px-5 py-3 last:border-b-0">
          <div className="size-8 animate-pulse rounded-full bg-surface-muted" />
          <div className="h-4 w-24 animate-pulse rounded-full bg-surface-muted" />
          <div className="ml-auto h-5 w-16 animate-pulse rounded-full bg-surface-muted" />
        </div>
      ))}
    </Card>
  )
}
