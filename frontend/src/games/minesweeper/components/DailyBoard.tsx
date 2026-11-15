import { CalendarDays, Trophy } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { CoinAmount } from '@/components/ui/CoinAmount'
import { BoardOverlay } from '@/games/shared/components/BoardOverlay'
import { Key } from '@/games/shared/components/GameShell'
import { cn } from '@/lib/cn'
import { formatGameTime } from '@/lib/format'
import { coveredBoard, formatCountdown, formatUtcDate, toBoardState } from '../daily/dailyView'
import { useDailyBoard, type DailyBoardController } from '../hooks/useDailyBoard'
import type { DailyAttempt, DailyLeaderboard, DailyReward } from '../types/dailyTypes'
import { MinesweeperBoard } from './MinesweeperBoard'
import { ToolToggle } from './ToolToggle'

/** Where a signed-out player signs in, coming straight back to the Daily Board. */
export const DAILY_LOGIN_PATH = `/login?redirect=${encodeURIComponent('/games/minesweeper')}`

/**
 * The Daily Board: one 16 × 16 board with 40 mines a day (UTC), the same for every signed-in player,
 * played on the server. One attempt per account per day, timed by the server from the moment it
 * starts, ranked on the day's own leaderboard. The board shown is the server's: no mine is known here
 * until one goes off.
 */
export function DailyBoard({ onLeave, onRewarded }: { onLeave: () => void; onRewarded?: () => void }) {
  const daily = useDailyBoard(onRewarded)
  const { today, attempt } = daily
  const state = attempt ? toBoardState(attempt) : coveredBoard(today ?? undefined)
  const waiting = daily.pending !== null
  // The board on screen: an attempt started before the reset keeps its own day's number and date.
  const shown = attempt ?? today
  const carriedOver = attempt !== null && today !== null && attempt.date !== today.date

  const stats = [
    { label: 'Mines', value: attempt ? attempt.minesLeft : (today?.mines ?? 40) },
    { label: 'Time', value: <span className="tabular-nums">{formatGameTime(daily.elapsedMs)}</span> },
    { label: 'Moves', value: attempt?.moves ?? 0 },
  ]

  return (
    <div className="grid gap-6 p-4 sm:p-6 lg:grid-cols-[minmax(0,1fr)_19rem] lg:items-start">
      <div data-theme-keep className="flex min-w-0 flex-col items-center gap-5">
        <div className="relative w-full rounded-2xl" aria-busy={waiting || undefined}>
          <MinesweeperBoard state={state} onAct={daily.act} onReveal={daily.reveal} onFlag={daily.flag} />
          {waiting && daily.pending?.slow && (
            <p
              role="status"
              className="pointer-events-none absolute -top-3 left-1/2 z-20 -translate-x-1/2 rounded-full bg-night px-4 py-1 font-display text-sm font-semibold whitespace-nowrap text-white shadow-soft"
            >
              Waiting for the server…
            </p>
          )}
          <Overlay daily={daily} />
        </div>
        {daily.failure && (
          <div role="alert" className="flex w-full max-w-md flex-col items-center gap-2 rounded-control bg-surface-muted p-3 text-center text-sm">
            <p>{daily.failure.message}</p>
            <Button size="sm" onClick={daily.failure.retry}>
              Try again
            </Button>
          </div>
        )}
        {attempt?.status === 'PLAYING' && <ToolToggle tool={daily.tool} onChange={daily.setTool} />}
      </div>

      <aside className="flex flex-col gap-4">
        <section aria-labelledby="daily-board-title" className="rounded-control bg-surface-muted p-3">
          <h2 id="daily-board-title" className="flex items-center gap-2 font-display text-base font-semibold">
            <CalendarDays aria-hidden className="size-4" />
            Daily Board{shown ? ` #${shown.boardNumber}` : ''}
          </h2>
          {shown && <p className="mt-1 text-sm">{formatUtcDate(shown.date)}</p>}
          {carriedOver && attempt.status === 'PLAYING' && (
            <p className="mt-1 text-sm text-ink-soft">
              Started before the reset: it still counts for its own day, within its time limit.
            </p>
          )}
          {today && (
            <p className="mt-1 text-sm text-ink-soft">
              Next board in <span className="font-semibold text-ink tabular-nums">{formatCountdown(daily.untilResetMs)}</span>, at
              00:00 UTC.
            </p>
          )}
          <p className="mt-2 text-sm text-ink-soft">
            Everyone gets the same 16 × 16 board with 40 mines, its opening already uncovered. One attempt per account per
            day: the server times it from the moment you start, and the fastest clear ranks first.
          </p>
          <button
            type="button"
            onClick={onLeave}
            disabled={attempt?.status === 'PLAYING'}
            className="mt-2 text-sm font-semibold text-brand-700 underline-offset-2 hover:underline disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:no-underline"
          >
            ← Classic and timed modes
          </button>
          {attempt?.status === 'PLAYING' && (
            <p className="mt-1 text-xs text-ink-soft">The server's clock keeps running: finish this board first.</p>
          )}
        </section>

        <dl className="grid grid-cols-[repeat(auto-fit,minmax(5rem,1fr))] gap-2">
          {stats.map(({ label, value }) => (
            <div key={label} className="rounded-control bg-surface-muted px-3 py-2">
              <dt className="text-xs font-bold tracking-wide text-ink-soft uppercase">{label}</dt>
              <dd className="font-display text-2xl font-semibold tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>

        {daily.load === 'ready' && (
          <Leaderboard
            board={daily.leaderboard}
            today={today?.date ?? null}
            failed={daily.leaderboardFailed}
            onRetry={daily.reloadLeaderboard}
          />
        )}

        <div className="flex flex-col gap-2 rounded-control bg-surface-muted p-4 text-sm text-ink-soft">
          <p>Click to reveal, right click (or <Key>F</Key>) to flag. On a phone, switch between Reveal and Flag under the board.</p>
          <p>
            With a keyboard, Tab to the board and move with the arrow keys: <Key>Enter</Key> reveals, <Key>F</Key> flags.
          </p>
          <p>Each move goes to the server, which answers with the board: the time shown while you play is an estimate, and the server's time is the one that counts.</p>
        </div>
      </aside>
    </div>
  )
}

/** The board's message: sign in, start, or how the attempt ended. Nothing while it is played. */
function Overlay({ daily }: { daily: DailyBoardController }) {
  const { attempt, today } = daily
  const nextBoard = `The next board comes out at 00:00 UTC, in ${formatCountdown(daily.untilResetMs)}.`

  if (daily.load === 'loading') return <BoardOverlay title="Loading today's board…" />
  if (daily.load === 'signed-out') {
    return (
      <BoardOverlay
        title="Sign in to play"
        description="The Daily Board is ranked, so it needs an account: one attempt per player per day."
        action={
          // A full page load, not an in-app link: when the server's session has ended mid-attempt the
          // app may still hold the old one, and its login page would send a "signed-in" player
          // straight back here. Loading the page asks the server who is signed in.
          <a href={DAILY_LOGIN_PATH} className="font-display font-semibold text-brand-700 underline-offset-2 hover:underline">
            Sign in
          </a>
        }
      />
    )
  }
  if (daily.load === 'failed') {
    return (
      <BoardOverlay
        title="Couldn't load today's board"
        description={daily.loadError ?? undefined}
        action={<Button onClick={daily.reload}>Try again</Button>}
      />
    )
  }
  if (!attempt) {
    return (
      <BoardOverlay
        title="Today's board is ready"
        description="Your one attempt today starts the moment you press Start: the opening is uncovered for you, and the server's clock begins."
        action={
          <Button onClick={daily.start} disabled={!daily.canStart}>
            {daily.pending?.kind === 'start' ? 'Starting…' : 'Start'}
          </Button>
        }
      />
    )
  }
  if (attempt.status === 'PLAYING') return null

  const startNew =
    today && today.date !== attempt.date && today.attempt === null ? (
      <Button onClick={daily.start} disabled={!daily.canStart}>
        Play today's board
      </Button>
    ) : undefined
  return (
    <BoardOverlay
      title={TITLES[attempt.status]}
      description={
        <>
          {describe(attempt)} {startNew ? "A new day's board is out." : nextBoard}
        </>
      }
      action={
        attempt.status === 'WON' && attempt.reward ? (
          <>
            <RewardSummary reward={attempt.reward} />
            {startNew}
          </>
        ) : (
          startNew
        )
      }
    />
  )
}

/** What the win earned, as the server paid it: the same after a reload. */
function RewardSummary({ reward }: { reward: DailyReward }) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <p className="flex flex-wrap items-center justify-center gap-1.5">
        <span className="sr-only">Earned:</span>
        <Badge tone="brand">+{reward.xp} XP</Badge>
        {reward.coins > 0 && (
          <Badge tone="warning" className="py-0">
            <CoinAmount amount={reward.coins} signed className="text-xs" />
          </Badge>
        )}
      </p>
      {reward.coins === 0 && (
        <p className="max-w-xs text-xs text-ink-soft">No coins this time: today's paid games were used up already.</p>
      )}
    </div>
  )
}

const TITLES: Record<Exclude<DailyAttempt['status'], 'PLAYING'>, string> = {
  WON: 'Board cleared!',
  LOST: 'Boom!',
  EXPIRED: "Time's up",
}

function describe(attempt: DailyAttempt): string {
  const safe = attempt.rows * attempt.columns - attempt.mines
  if (attempt.status === 'WON') {
    return `You cleared the Daily Board in ${formatGameTime(attempt.elapsedMs ?? 0)}, as the server timed it.`
  }
  if (attempt.status === 'LOST') {
    return `You hit a mine with ${attempt.revealedCells} of ${safe} safe squares uncovered. Only a cleared board ranks.`
  }
  return `The attempt ran out of its time limit before the board was cleared, so it doesn't rank.`
}

/** The day's fastest clears, and where the player stands. */
function Leaderboard({
  board,
  today,
  failed,
  onRetry,
}: {
  board: DailyLeaderboard | null
  /** Today's date: an earlier day's board is named by its number instead. */
  today: string | null
  failed: boolean
  onRetry: () => void
}) {
  return (
    <section aria-labelledby="daily-leaderboard-title" className="rounded-control bg-surface-muted p-3">
      <h2 id="daily-leaderboard-title" className="flex items-center gap-2 font-display text-base font-semibold">
        <Trophy aria-hidden className="size-4" />
        {board && today !== null && board.date !== today ? `Board #${board.boardNumber}'s fastest` : "Today's fastest"}
      </h2>
      {failed ? (
        <p className="mt-2 text-sm text-ink-soft">
          Couldn't load the leaderboard.{' '}
          <button type="button" onClick={onRetry} className="font-semibold text-brand-700 underline-offset-2 hover:underline">
            Try again
          </button>
        </p>
      ) : !board ? (
        <p className="mt-2 text-sm text-ink-soft">Loading…</p>
      ) : board.entries.length === 0 ? (
        <p className="mt-2 text-sm text-ink-soft">Nobody has cleared this board yet.</p>
      ) : (
        <ol aria-label={`Daily Board #${board.boardNumber} leaderboard`} className="mt-2 flex flex-col gap-1">
          {board.entries.map((entry) => (
            <li
              key={entry.rank}
              aria-current={entry.you || undefined}
              className={cn('flex items-center gap-2 rounded-lg px-2 py-1 text-sm', entry.you && 'bg-surface font-semibold')}
            >
              <span className="w-6 text-right text-ink-soft tabular-nums">{entry.rank}</span>
              <span className="min-w-0 flex-1 truncate">
                {entry.player.displayName}
                {entry.you && ' (you)'}
              </span>
              <span className="tabular-nums">{formatGameTime(entry.elapsedMs)}</span>
            </li>
          ))}
        </ol>
      )}
      {board && (
        <p className="mt-2 text-sm text-ink-soft">
          {board.myRank !== null
            ? `You're #${board.myRank} of ${board.totalEntries}, in ${formatGameTime(board.myElapsedMs ?? 0)}.`
            : `${board.totalEntries} ${board.totalEntries === 1 ? 'player has' : 'players have'} cleared it. Clear it to rank.`}
        </p>
      )}
    </section>
  )
}
