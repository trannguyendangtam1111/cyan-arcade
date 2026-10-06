import { ArrowRight, RotateCcw } from 'lucide-react'
import { Link } from 'react-router'
import { useLeaderboard } from '@/api/leaderboards'
import { Avatar } from '@/components/ui/Avatar'
import { Badge } from '@/components/ui/Badge'
import { Card } from '@/components/ui/Card'
import { RankBadge } from '@/components/ui/RankBadge'
import type { GameDefinition } from '@/games/types'
import { accentStyle } from '@/lib/accent'
import { formatScore } from '@/lib/format'

const TOP_COUNT = 3

/** The top of each game's leaderboard, side by side, with a way to the full boards. */
export function LeaderboardPreview({ games }: { games: GameDefinition[] }) {
  return (
    // Two columns on tablets: three would leave no room for a long name next to a long score.
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {games.map((game) => (
        <li key={game.slug} className="flex *:w-full">
          <TopScores game={game} />
        </li>
      ))}
    </ul>
  )
}

function TopScores({ game }: { game: GameDefinition }) {
  // The first page of the real leaderboard, so this and the leaderboard page share one request.
  const { data, isPending, isError, refetch } = useLeaderboard(game.slug, 'ALL_TIME', 0)
  const boardUrl = `/leaderboard?game=${encodeURIComponent(game.slug)}`

  return (
    <Card
      padding="none"
      style={accentStyle(game.accentColor)}
      className="flex flex-col overflow-hidden border-t-8 border-(--accent)"
    >
      <div className="flex items-center justify-between gap-3 px-5 pt-4 pb-2">
        <h3 className="text-lg font-semibold">{game.name}</h3>
        <Link
          to={boardUrl}
          aria-label={`Full ${game.name} leaderboard`}
          className="group inline-flex items-center gap-1 rounded text-sm font-bold text-brand-700 hover:text-brand-900"
        >
          Full board
          <ArrowRight aria-hidden className="size-4 transition-transform group-hover:translate-x-0.5" />
        </Link>
      </div>

      {isPending && (
        <div role="status" aria-label={`Loading ${game.name} scores`} className="px-5 pb-4">
          {Array.from({ length: TOP_COUNT }, (_, index) => (
            <div key={index} className="flex items-center gap-3 py-2">
              <div className="size-8 animate-pulse rounded-full bg-surface-muted" />
              <div className="h-4 w-24 animate-pulse rounded-full bg-surface-muted" />
              <div className="ml-auto h-4 w-12 animate-pulse rounded-full bg-surface-muted" />
            </div>
          ))}
        </div>
      )}

      {isError && !data && (
        <p className="flex flex-1 flex-wrap items-center gap-x-2 gap-y-1 px-5 pb-5 text-sm text-ink-soft">
          Scores couldn't be loaded.
          <button
            type="button"
            onClick={() => void refetch()}
            className="inline-flex items-center gap-1 rounded font-bold text-brand-700 hover:text-brand-900"
          >
            <RotateCcw aria-hidden className="size-3.5" />
            Reload {game.name} scores
          </button>
        </p>
      )}

      {data?.entries.length === 0 && (
        <p className="flex-1 px-5 pb-5 text-ink-soft">
          No scores yet.{' '}
          {game.module && (
            <Link to={`/games/${game.slug}`} className="rounded font-bold text-brand-700 hover:text-brand-900">
              Be the first
            </Link>
          )}
        </p>
      )}

      {data && data.entries.length > 0 && (
        <ol aria-label={`Top ${game.name} scores`} className="px-5 pb-4">
          {data.entries.slice(0, TOP_COUNT).map((entry, index) => (
            <li key={index} className="flex items-center gap-3 border-t border-line py-2 first:border-t-0">
              <RankBadge rank={entry.rank} />
              <span className="flex min-w-0 items-center gap-2">
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
              <span className="ml-auto font-display font-semibold tabular-nums">{formatScore(entry.score)}</span>
            </li>
          ))}
        </ol>
      )}
    </Card>
  )
}
