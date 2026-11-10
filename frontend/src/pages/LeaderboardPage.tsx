import { CalendarClock, Crown, Medal, Sparkles, Trophy } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router'
import {
  CLASSIC,
  rankedModes,
  useGameModes,
  type GameMode,
  type ModeUnit,
} from '@/api/games'
import {
  LEADERBOARD_PERIODS,
  boardRules,
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
import { formatDate, formatDuration, formatGameTime, formatScore, formatTimeLeft } from '@/lib/format'

const periodFromParam = (param: string | null): LeaderboardPeriod =>
  LEADERBOARD_PERIODS.find((period) => periodNames[period].param === param) ?? 'ALL_TIME'

/**
 * How a board's scores are written: points as a number, a timed mode's milliseconds as a race time to
 * the hundredth (`1:05.04`), so times that rank apart never read alike. Display only: the board's
 * order and every request keep the exact milliseconds.
 */
const formatterOf = (unit: ModeUnit): ((value: number) => string) =>
  unit === 'MILLISECONDS' ? formatGameTime : formatScore

/**
 * The board to show for the mode in the URL, among the game's ranked modes (`undefined` while
 * they are still being asked for). Anything that is not one of them, an unranked mode included,
 * gets the Classic board.
 */
function boardMode(ranked: GameMode[] | undefined, requested: string): GameMode | undefined {
  if (!ranked) return requested === CLASSIC.id ? CLASSIC : undefined
  return (
    ranked.find((mode) => mode.id === requested) ??
    ranked.find((mode) => mode.id === CLASSIC.id) ??
    ranked[0] ??
    CLASSIC
  )
}

/**
 * The arcade's leaderboards: a game, a mode (Classic unless the game has more ranked modes), a
 * period (today, this week, all time), each player once with their best score. The selection lives
 * in the URL (`?game=2048&period=weekly&page=2`, plus `&mode=…` for a mode other than Classic), so a
 * board can be linked to and survives a reload. Everything on it is read from the server, which
 * also decides which modes a game has and when a day or a week starts.
 */
export function LeaderboardPage() {
  useDocumentTitle('Leaderboard')
  const [params, setParams] = useSearchParams()
  const catalog = useGameCatalog()
  const { isPending, isError, refetch } = catalog
  // Only scored games have boards.
  const games = catalog.games?.filter((game) => game.scored)

  const selected = games?.find((game) => game.slug === params.get('game')) ?? games?.[0]
  const period = periodFromParam(params.get('period'))
  // Pages are 1-based in the URL because people read it, and 0-based in the API.
  const page = Math.max(1, Math.floor(Number(params.get('page'))) || 1)

  // The server says which modes a game has; only the ranked ones have boards. Asked once per game.
  const modes = useGameModes(selected?.slug ?? '', { enabled: selected !== undefined })
  const ranked = modes.data && rankedModes(modes.data)
  const requestedMode = params.get('mode') ?? CLASSIC.id
  const mode = boardMode(ranked, requestedMode)

  /** Another game starts on its Classic board; another mode or period, on the first page. */
  const select = (game: string, nextPeriod: LeaderboardPeriod, nextPage?: number, nextMode: string = CLASSIC.id) =>
    setParams({
      game,
      ...(nextMode !== CLASSIC.id && { mode: nextMode }),
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
                    onClick={() => select(selected.slug, option, undefined, mode?.id ?? requestedMode)}
                    className={cn(
                      'rounded-full px-3 py-1.5 font-display font-medium whitespace-nowrap transition-all active:scale-95 sm:px-4',
                      option === period ? 'bg-ink text-canvas shadow-soft' : 'text-ink-soft hover:text-ink',
                    )}
                  >
                    {periodNames[option].label}
                  </button>
                ))}
              </div>
          </div>

          {/* Only a game with more than one board has a choice to make: most have Classic alone. */}
          {ranked && ranked.length > 1 && mode && (
            <div
              role="group"
              aria-label="Choose a mode"
              className="flex w-fit max-w-full gap-1 overflow-x-auto rounded-full bg-surface p-1 shadow-soft ring-1 ring-line"
            >
              {ranked.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  aria-pressed={option.id === mode.id}
                  onClick={() => select(selected.slug, period, undefined, option.id)}
                  className={cn(
                    'shrink-0 rounded-full px-3 py-1.5 font-display font-medium whitespace-nowrap transition-all active:scale-95 sm:px-4',
                    option.id === mode.id ? 'bg-(--accent) text-(--accent-ink) shadow-soft' : 'text-ink-soft hover:text-ink',
                  )}
                >
                  {option.name}
                </button>
              ))}
            </div>
          )}

          {mode ? (
            <GameLeaderboard
              key={`${selected.slug}-${mode.id}-${period}`}
              game={selected}
              mode={mode}
              period={period}
              page={page}
              onPageChange={(next) => select(selected.slug, period, next, mode.id)}
            />
          ) : modes.isError ? (
            // The board asked for is not Classic, and whether the game has it is not known yet.
            <ErrorState title={`Couldn't load the modes of ${selected.name}`} onRetry={() => void modes.refetch()} />
          ) : (
            <LeaderboardSkeleton />
          )}
        </div>
      )}
    </>
  )
}

interface GameLeaderboardProps {
  game: GameDefinition
  /** A ranked mode of the game. */
  mode: GameMode
  period: LeaderboardPeriod
  /** 1-based. */
  page: number
  onPageChange: (page: number) => void
}

function GameLeaderboard({ game, mode, period, page, onPageChange }: GameLeaderboardProps) {
  const { data, isPending, isError, isPlaceholderData, refetch } = useLeaderboard(game.slug, mode.id, period, page - 1)

  if (isPending) return <LeaderboardSkeleton />
  if (isError) return <ErrorState title="Couldn't load this leaderboard" onRetry={() => void refetch()} />

  return (
    <BoardView
      game={game}
      mode={mode}
      data={data}
      title={`${game.name}${mode.id === CLASSIC.id && mode.name === CLASSIC.name ? '' : ` ${mode.name}`} · ${periodNames[period].label}`}
      dimmed={isPlaceholderData}
      page={page}
      onPageChange={onPageChange}
      empty={{
        title: period === 'ALL_TIME' ? 'No scores yet' : `No scores ${periodNames[period].board} yet`,
        description: `Nobody has finished a game of ${game.name} ${period === 'ALL_TIME' ? 'yet' : periodNames[period].board}. The top spot is yours for the taking.`,
        action: <PlayLink game={game} />,
      }}
    />
  )
}

function PlayLink({ game }: { game: GameDefinition }) {
  return (
    <Link to={`/games/${game.slug}`} className={buttonStyles('primary')}>
      Play {game.name}
    </Link>
  )
}

interface BoardViewProps {
  game: GameDefinition
  mode: GameMode
  data: LeaderboardResponse
  /** What the board is, for its table's caption. */
  title: string
  /** Whether the previous board is shown while this one loads. */
  dimmed: boolean
  /** 1-based. */
  page: number
  onPageChange: (page: number) => void
  /** What a board with nobody on it says. */
  empty: { title: string; description: string; action: ReactNode }
}

/** A board's page: the caller's rank, the podium and the rest, written the way its scores count. */
function BoardView({ game, mode, data, title, dimmed, page, onPageChange, empty }: BoardViewProps) {
  // The server ranks the board; this only writes its scores the way they count (points or a time).
  const { order, unit } = boardRules(data, mode)
  const format = formatterOf(unit)
  const timed = unit === 'MILLISECONDS'
  if (data.totalEntries === 0) {
    return <EmptyState icon={Medal} title={empty.title} description={empty.description} action={empty.action} />
  }

  // The podium is the top of the board: the first three, on its first page.
  const podium = data.page === 0 ? data.entries.filter((entry) => entry.rank <= 3) : []
  const rest = data.entries.filter((entry) => !podium.includes(entry))

  return (
    <div className={cn('flex flex-col gap-5 transition-opacity', dimmed && 'opacity-50')}>
      <YourRank data={data} game={game} format={format} />

      {podium.length > 0 && <Podium entries={podium} gameName={game.name} format={format} />}

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
              {title} leaderboard, page {data.page + 1} of {data.totalPages},{' '}
              {order === 'ASC' ? (timed ? 'fastest first' : 'lowest first') : timed ? 'longest first' : 'highest first'}
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
                  {timed ? 'Time' : 'Score'}
                </th>
                {/* A timed board's score is already its time. */}
                {!timed && (
                  <th scope="col" className="hidden w-20 py-3 text-right sm:table-cell">
                    Time
                  </th>
                )}
                <th scope="col" className="hidden w-32 py-3 pr-5 text-right md:table-cell">
                  Date
                </th>
              </tr>
            </thead>
            <tbody>
              {rest.map((entry) => (
                <LeaderboardRow key={entry.rank} entry={entry} format={format} timed={timed} />
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
interface YourRankProps {
  data: LeaderboardResponse
  game: GameDefinition
  format: (value: number) => string
}

function YourRank({ data, game, format }: YourRankProps) {
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
            of {formatScore(data.totalEntries)} · best <strong className="text-ink">{format(data.myScore)}</strong>
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
interface PodiumProps {
  entries: LeaderboardEntry[]
  gameName: string
  format: (value: number) => string
}

function Podium({ entries, gameName, format }: PodiumProps) {
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
              {format(entry.score)}
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

interface LeaderboardRowProps {
  entry: LeaderboardEntry
  format: (value: number) => string
  /** Whether the score is a time, which leaves the separate time column out. */
  timed: boolean
}

function LeaderboardRow({ entry, format, timed }: LeaderboardRowProps) {
  return (
    <tr className={cn('border-t border-line', entry.you && 'bg-(--accent)/10')}>
      <td className="py-3 pl-4 sm:pl-5">
        <RankBadge rank={entry.rank} />
      </td>
      <td className="py-3">
        <PlayerName entry={entry} />
      </td>
      <td className="py-3 pr-4 text-right font-display text-lg font-semibold tabular-nums sm:pr-3">
        {format(entry.score)}
      </td>
      {!timed && (
        <td className="hidden py-3 text-right text-ink-soft tabular-nums sm:table-cell">
          {formatDuration(entry.durationMs)}
        </td>
      )}
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
