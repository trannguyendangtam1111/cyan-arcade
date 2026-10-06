import { CalendarClock, Crown, Medal, Sparkles, Trophy } from 'lucide-react'
import { Link, useSearchParams } from 'react-router'
import {
  LEADERBOARD_PERIODS,
  periodNames,
  useLeaderboard,
  type LeaderboardEntry,
  type LeaderboardPeriod,
  type LeaderboardResponse,
} from '@/api/leaderboards'
import { Avatar } from '@/components/ui/Avatar'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { buttonStyles } from '@/components/ui/buttonStyles'
import { Card } from '@/components/ui/Card'
import { cardStyles } from '@/components/ui/cardStyles'
import { EmptyState } from '@/components/ui/EmptyState'
import { ErrorState } from '@/components/ui/ErrorState'
import { LoadingState } from '@/components/ui/LoadingState'
import { PageHeader } from '@/components/ui/PageHeader'
import { Pager } from '@/components/ui/Pager'
import { RankBadge } from '@/components/ui/RankBadge'
import type { GameDefinition } from '@/games/types'
import { useCountdown } from '@/hooks/useCountdown'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { useGameCatalog } from '@/hooks/useGameCatalog'
import { accentStyle } from '@/lib/accent'
import { cn } from '@/lib/cn'
import { formatDate, formatDuration, formatScore, formatTimeLeft } from '@/lib/format'

const periodFromParam = (param: string | null): LeaderboardPeriod =>
  LEADERBOARD_PERIODS.find((period) => periodNames[period].param === param) ?? 'ALL_TIME'

/**
 * The arcade's leaderboards: a game, a period (today, this week, all time), each player once with
 * their best score. The selection lives in the URL (`?game=2048&period=weekly&page=2`), so a board
 * can be linked to and survives a reload. Everything on it is read from the server, which also
 * decides when a day or a week starts.
 */
export function LeaderboardPage() {
  useDocumentTitle('Leaderboard')
  const [params, setParams] = useSearchParams()
  const { games, isPending, isError, refetch } = useGameCatalog()

  const selected = games?.find((game) => game.slug === params.get('game')) ?? games?.[0]
  const period = periodFromParam(params.get('period'))
  // Pages are 1-based in the URL because people read it, and 0-based in the API.
  const page = Math.max(1, Math.floor(Number(params.get('page'))) || 1)

  const select = (game: string, nextPeriod: LeaderboardPeriod, nextPage?: number) =>
    setParams({
      game,
      period: periodNames[nextPeriod].param,
      ...(nextPage !== undefined && nextPage > 1 && { page: String(nextPage) }),
    })

  return (
    <>
      <PageHeader
        icon={Trophy}
        title="Leaderboard"
        description="The best players in the arcade: today, this week and of all time."
      />

      {isPending && <LoadingState label="Loading games…" />}
      {isError && <ErrorState title="Couldn't load the games" onRetry={() => void refetch()} />}
      {games?.length === 0 && (
        <EmptyState icon={Sparkles} title="No games yet" description="Leaderboards appear once the arcade has games." />
      )}

      {games && selected && (
        <div style={accentStyle(selected.accentColor)} className="flex flex-col gap-5">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div role="group" aria-label="Choose a game" className="flex flex-wrap gap-2">
              {games.map((game) => {
                const isSelected = game.slug === selected.slug
                return (
                  <button
                    key={game.slug}
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() => select(game.slug, period)}
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

            <div
              role="group"
              aria-label="Choose a period"
              className="grid grid-cols-3 rounded-full bg-surface p-1 shadow-soft ring-1 ring-line md:w-auto"
            >
              {LEADERBOARD_PERIODS.map((option) => (
                <button
                  key={option}
                  type="button"
                  aria-pressed={option === period}
                  onClick={() => select(selected.slug, option)}
                  className={cn(
                    'rounded-full px-3 py-1.5 font-display font-medium whitespace-nowrap transition-all active:scale-95 sm:px-4',
                    option === period ? 'bg-ink text-white shadow-soft' : 'text-ink-soft hover:text-ink',
                  )}
                >
                  {periodNames[option].label}
                </button>
              ))}
            </div>
          </div>

          <GameLeaderboard
            // A different game or period is a different board: start it clean rather than showing stale rows.
            key={`${selected.slug}-${period}`}
            game={selected}
            period={period}
            page={page}
            onPageChange={(next) => select(selected.slug, period, next)}
          />
        </div>
      )}
    </>
  )
}

interface GameLeaderboardProps {
  game: GameDefinition
  period: LeaderboardPeriod
  /** 1-based. */
  page: number
  onPageChange: (page: number) => void
}

function GameLeaderboard({ game, period, page, onPageChange }: GameLeaderboardProps) {
  const { data, isPending, isError, isPlaceholderData, refetch } = useLeaderboard(game.slug, period, page - 1)

  if (isPending) return <LeaderboardSkeleton />
  if (isError) return <ErrorState title="Couldn't load this leaderboard" onRetry={() => void refetch()} />

  const title = `${game.name} · ${periodNames[period].label}`
  if (data.totalEntries === 0) {
    return (
      <EmptyState
        icon={Medal}
        title={period === 'ALL_TIME' ? 'No scores yet' : `No scores ${periodNames[period].board} yet`}
        description={`Nobody has finished a game of ${game.name} ${period === 'ALL_TIME' ? 'yet' : periodNames[period].board}. The top spot is yours for the taking.`}
        action={
          <Link to={`/games/${game.slug}`} className={buttonStyles('primary')}>
            Play {game.name}
          </Link>
        }
      />
    )
  }

  // The podium is the top of the board: the first three, on its first page.
  const podium = data.page === 0 ? data.entries.filter((entry) => entry.rank <= 3) : []
  const rest = data.entries.filter((entry) => !podium.includes(entry))

  return (
    <div className={cn('flex flex-col gap-5 transition-opacity', isPlaceholderData && 'opacity-50')}>
      <YourRank data={data} game={game} />

      {podium.length > 0 && <Podium entries={podium} gameName={game.name} />}

      {data.entries.length === 0 && (
        <Card className="flex flex-col items-center gap-3 py-10 text-center text-ink-soft">
          <p>There are no scores on this page.</p>
          <Button variant="secondary" size="sm" onClick={() => onPageChange(1)}>
            Back to the top
          </Button>
        </Card>
      )}

      {rest.length > 0 && (
        <Card padding="none" className="overflow-hidden">
          <table className="w-full table-fixed text-left">
            <caption className="sr-only">
              {title} leaderboard, page {data.page + 1} of {data.totalPages}
            </caption>
            <thead className="text-xs font-bold tracking-wide text-ink-soft uppercase">
              <tr>
                <th scope="col" className="w-16 py-3 pl-4 sm:w-20 sm:pl-5">
                  Rank
                </th>
                <th scope="col" className="py-3">
                  Player
                </th>
                <th scope="col" className="w-24 py-3 pr-4 text-right sm:w-28 sm:pr-3">
                  Score
                </th>
                <th scope="col" className="hidden w-20 py-3 text-right sm:table-cell">
                  Time
                </th>
                <th scope="col" className="hidden w-32 py-3 pr-5 text-right md:table-cell">
                  Date
                </th>
              </tr>
            </thead>
            <tbody>
              {rest.map((entry) => (
                <LeaderboardRow key={entry.rank} entry={entry} />
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <Pager label="Leaderboard pages" page={page} totalPages={data.totalPages} onPageChange={onPageChange} />
    </div>
  )
}

/**
 * The caller's place on this board, above everything else so it is never scrolled away: their
 * rank and best score in the period, or an invitation to get on it. Never a made-up rank.
 */
function YourRank({ data, game }: { data: LeaderboardResponse; game: GameDefinition }) {
  const timeLeft = useCountdown(data.periodEnd ?? undefined)

  return (
    <section
      aria-label="Your rank"
      className={cardStyles(
        'md',
        'flex flex-wrap items-center justify-between gap-x-6 gap-y-3 bg-linear-to-r from-(--accent)/15 to-surface',
      )}
    >
      {data.myRank !== null && data.myScore !== null ? (
        <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="text-sm font-bold tracking-wide text-ink-soft uppercase">Your rank</span>
          <span className="font-display text-4xl font-bold tabular-nums">#{formatScore(data.myRank)}</span>
          <span className="text-ink-soft">
            of {formatScore(data.totalEntries)} · best <strong className="text-ink">{formatScore(data.myScore)}</strong>
          </span>
        </p>
      ) : (
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="font-display text-lg font-semibold">You're not on this board yet.</span>
          <Link to={`/games/${game.slug}`} className="rounded font-bold text-brand-700 hover:text-brand-900">
            Play to get on the board →
          </Link>
        </p>
      )}
      {timeLeft !== null && (
        <p className="inline-flex items-center gap-1.5 text-sm font-bold text-ink-soft">
          <CalendarClock aria-hidden className="size-4" />
          {timeLeft === 0 ? 'A new board starts any moment' : `New board in ${formatTimeLeft(timeLeft)}`}
        </p>
      )}
    </section>
  )
}

const podiumStyles: Record<number, { card: string; medal: string; label: string }> = {
  1: { card: 'sm:order-2 bg-linear-to-b from-amber-100 to-surface ring-amber-300 sm:pt-8 sm:pb-7', medal: '🥇', label: 'First' },
  2: { card: 'sm:order-1 bg-linear-to-b from-slate-100 to-surface ring-slate-300', medal: '🥈', label: 'Second' },
  3: { card: 'sm:order-3 bg-linear-to-b from-orange-100 to-surface ring-orange-300', medal: '🥉', label: 'Third' },
}

/** The top three as a podium: first in the middle and a little higher, on wider screens. */
function Podium({ entries, gameName }: { entries: LeaderboardEntry[]; gameName: string }) {
  return (
    <ol aria-label={`Top ${entries.length} in ${gameName}`} className="grid gap-4 pt-4 sm:grid-cols-3 sm:items-end">
      {entries.map((entry) => {
        const style = podiumStyles[entry.rank]
        return (
          <li
            key={entry.rank}
            className={cn(
              'relative flex min-w-0 items-center gap-4 rounded-card p-4 shadow-soft ring-2 motion-safe:animate-pop-in sm:flex-col sm:p-5 sm:text-center',
              style.card,
              entry.you && 'outline-4 outline-offset-2 outline-(--accent)',
            )}
          >
            {entry.rank === 1 && (
              <Crown
                aria-hidden
                className="absolute -top-4 left-1/2 hidden size-8 -translate-x-1/2 text-amber-500 sm:block"
                fill="currentColor"
              />
            )}
            <span aria-hidden className="text-3xl sm:text-4xl">
              {style.medal}
            </span>
            <span className="sr-only">Rank {entry.rank}</span>
            <PlayerName entry={entry} size="lg" className="sm:flex-col" />
            <span className="ml-auto font-display text-2xl font-bold tabular-nums sm:ml-0 sm:text-3xl">
              {formatScore(entry.score)}
            </span>
          </li>
        )
      })}
    </ol>
  )
}

interface PlayerNameProps {
  entry: LeaderboardEntry
  size?: 'sm' | 'lg'
  className?: string
}

/** Avatar and name (or "Guest"), cut short with an ellipsis rather than pushing the layout. */
function PlayerName({ entry, size = 'sm', className }: PlayerNameProps) {
  return (
    <span className={cn('flex min-w-0 items-center gap-2', className)}>
      {entry.player ? (
        // The display name is shown; the username, which never changes, is what the link uses.
        <Link
          to={`/players/${encodeURIComponent(entry.player.username)}`}
          className={cn('flex min-w-0 items-center gap-2 rounded hover:text-brand-700', className)}
        >
          <Avatar avatar={entry.player.avatar} size={size === 'lg' ? 'md' : 'sm'} />
          <span
            className={cn('min-w-0 max-w-full truncate font-bold', size === 'lg' && 'text-lg')}
            title={`${entry.player.displayName} (@${entry.player.username})`}
          >
            {entry.player.displayName}
          </span>
        </Link>
      ) : (
        <span className="text-ink-soft">Guest</span>
      )}
      {entry.you && <Badge tone="accent">You</Badge>}
    </span>
  )
}

function LeaderboardRow({ entry }: { entry: LeaderboardEntry }) {
  return (
    <tr className={cn('border-t border-line', entry.you && 'bg-(--accent)/10')}>
      <td className="py-3 pl-4 sm:pl-5">
        <RankBadge rank={entry.rank} />
      </td>
      <td className="py-3">
        <PlayerName entry={entry} />
      </td>
      <td className="py-3 pr-4 text-right font-display text-lg font-semibold tabular-nums sm:pr-3">
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
