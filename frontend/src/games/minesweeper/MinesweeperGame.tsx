import { CalendarDays } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { Button } from '@/components/ui/Button'
import { BoardOverlay } from '@/games/shared/components/BoardOverlay'
import { GameShell, Key, type GameStat } from '@/games/shared/components/GameShell'
import type { GameProps } from '@/games/types'
import { cn } from '@/lib/cn'
import { formatGameTime, formatScore } from '@/lib/format'
import { isLargeBoard } from './components/boardLayout'
import { DailyBoard } from './components/DailyBoard'
import { MinesweeperBoard } from './components/MinesweeperBoard'
import { ToolToggle } from './components/ToolToggle'
import { useMinesweeperGame } from './hooks/useMinesweeperGame'
import { CLASSIC, TIMED_MODES, findTimedMode, leaderboardPath, type MinesweeperRuleset } from './modes'

/** Seconds as `m:ss`, for the game clock. */
function clock(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

/**
 * Minesweeper's screen: Classic, or the Beginner, Intermediate and Expert races while the server
 * declares them. The mode is chosen between runs and the game set up afresh for it, so a run keeps the
 * mode it began with.
 */
export default function MinesweeperGame(props: GameProps) {
  // Classic, then each race only while the server declares its mode.
  const offered = TIMED_MODES.filter((option) => props.modes?.includes(option.mode) === true)
  const [chosen, setChosen] = useState(CLASSIC)
  const [view, setView] = useState<MinesweeperView>(rememberedView)
  const ruleset = findTimedMode(chosen)
  // A race chosen while it was declared stays chosen if it no longer is: it shows as unavailable, and
  // its runs are never played or reported as Classic.
  const available = ruleset ? offered.includes(ruleset) : true
  const go = (next: MinesweeperView) => {
    rememberView(next)
    setView(next)
  }

  if (view === 'daily') return <DailyBoard onLeave={() => go('modes')} onRewarded={props.onRewarded} />
  return (
    <MinesweeperPlay
      key={chosen}
      {...props}
      ruleset={ruleset}
      available={available}
      offered={offered}
      onChoose={setChosen}
      onDaily={() => go('daily')}
    />
  )
}

/** Classic and the races, played here and scored by the platform; or the Daily Board, played on the server. */
type MinesweeperView = 'modes' | 'daily'

/**
 * Remembered for this tab, so a reload (or signing in and coming back) returns to the Daily Board,
 * where the server's attempt picks up again.
 */
const VIEW_KEY = 'cyan-arcade:minesweeper:view'

function rememberedView(): MinesweeperView {
  try {
    return sessionStorage.getItem(VIEW_KEY) === 'daily' ? 'daily' : 'modes'
  } catch {
    return 'modes'
  }
}

function rememberView(view: MinesweeperView) {
  try {
    if (view === 'daily') sessionStorage.setItem(VIEW_KEY, view)
    else sessionStorage.removeItem(VIEW_KEY)
  } catch {
    // Storage unavailable: the view just isn't remembered.
  }
}

interface MinesweeperPlayProps extends GameProps {
  /** The race played; without one, Classic. */
  ruleset?: MinesweeperRuleset
  available: boolean
  /** The races the server declares: with none, only Classic is offered and no picker is shown. */
  offered: readonly MinesweeperRuleset[]
  onChoose: (mode: string) => void
  /** Opens the Daily Board instead. */
  onDaily: () => void
}

/** One mode's game. All behaviour lives in `useMinesweeperGame`; this file only lays it out. */
function MinesweeperPlay({ ruleset, available, offered, onChoose, onDaily, ...props }: MinesweeperPlayProps) {
  const game = useMinesweeperGame(props, ruleset, available)
  const { state } = game
  const playAgain = <Button onClick={game.restart}>Play again</Button>

  let overlay = null
  if (ruleset && game.timedOut) {
    overlay = (
      <BoardOverlay
        title="Time's up"
        description={`The clock reached ${formatGameTime(game.elapsedMs)} before the board was cleared. Only a cleared board is saved.`}
        action={playAgain}
      />
    )
  } else if (ruleset && state.status === 'won') {
    overlay = (
      <BoardOverlay
        title={game.newBest ? 'New best!' : 'Board cleared!'}
        description={`You cleared ${ruleset.name} in ${formatGameTime(game.elapsedMs)}.${
          game.newBest ? ' Your fastest on this device yet.' : ''
        }`}
        action={playAgain}
      />
    )
  } else if (ruleset && state.status === 'lost') {
    overlay = (
      <BoardOverlay
        title="Boom!"
        description={`You hit a mine after ${formatGameTime(game.elapsedMs)}, with ${state.revealed} of ${
          state.rows * state.columns - state.mines
        } safe squares uncovered. Only a cleared board is saved.`}
        action={playAgain}
      />
    )
  } else if (state.status === 'won') {
    overlay = (
      <BoardOverlay
        title={game.newBest ? 'New best!' : 'Board cleared!'}
        description={`Every mine avoided in ${clock(game.seconds)}. You scored ${formatScore(game.score)}.`}
        action={playAgain}
      />
    )
  } else if (state.status === 'lost') {
    overlay = (
      <BoardOverlay
        title="Boom!"
        description={`You hit a mine after uncovering ${state.revealed} safe ${state.revealed === 1 ? 'cell' : 'cells'}. You scored ${formatScore(game.score)}.`}
        action={playAgain}
      />
    )
  } else if (ruleset && !available && state.status === 'ready') {
    overlay = (
      <BoardOverlay
        title={`${ruleset.name} unavailable`}
        description={`${ruleset.name} cannot be played for a time right now.`}
        action={<Button onClick={() => onChoose(CLASSIC)}>Play Classic</Button>}
      />
    )
  } else if (game.startFailed) {
    overlay = (
      <BoardOverlay
        title={ruleset ? "Couldn't start the race" : "Couldn't start the game"}
        description={`The server didn't open this ${ruleset?.name ?? 'Classic'} run, so the board wasn't uncovered and no time was counted.`}
        action={<Button onClick={game.restart}>Try again</Button>}
      />
    )
  }

  const stats: GameStat[] = ruleset
    ? [
        { label: 'Mines', value: game.minesLeft },
        { label: 'Time', value: <span className="tabular-nums">{formatGameTime(game.elapsedMs)}</span> },
        { label: 'Best', value: <span className="tabular-nums">{game.best > 0 ? formatGameTime(game.best) : '–'}</span> },
      ]
    : [
        { label: 'Mines', value: game.minesLeft },
        { label: 'Time', value: clock(game.seconds) },
        { label: 'Score', value: game.score },
        { label: 'Best', value: Math.max(game.best, game.score) },
      ]

  return (
    <GameShell
      onRestart={game.restart}
      stats={stats}
      sidebarExtra={
        <>
          {(offered.length > 0 || ruleset) && (
            <ModePicker
              offered={offered}
              chosen={ruleset}
              available={available}
              locked={game.runInProgress}
              onChange={onChoose}
            />
          )}
          <DailyBoardEntry locked={game.runInProgress} onOpen={onDaily} />
        </>
      }
      humanHelp={
        <div className="flex flex-col gap-2">
          <p>
            Uncover every square without a mine. A number says how many of the eight squares around it hide one.
          </p>
          <p>
            Click to reveal, right click (or <Key>F</Key>) to flag. On a phone, switch between <strong className="text-ink">Reveal</strong>{' '}
            and <strong className="text-ink">Flag</strong> under the board.
          </p>
          <p>
            With a keyboard, Tab to the board and move with the arrow keys: <Key>Enter</Key> reveals, <Key>F</Key> flags.
          </p>
          {ruleset ? (
            <p>
              Your first square is always safe. In <strong className="text-ink">{ruleset.name}</strong> the clock starts
              when it opens, once the server has started your run, and keeps running, even in another tab. Only a
              cleared board is saved, ranked by its time.
            </p>
          ) : (
            <p>Your first square is always safe. Clear the board faster for a bigger score.</p>
          )}
        </div>
      }
      board={
        <div className={cn('relative w-full rounded-2xl', !isLargeBoard(state) && 'max-w-[30rem]')}>
          <MinesweeperBoard state={state} onAct={game.act} onReveal={game.reveal} onFlag={game.flag} />
          {state.status === 'ready' && available && !game.startFailed && (
            <p
              role={game.starting ? 'status' : undefined}
              className="pointer-events-none absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-night px-4 py-1 font-display text-sm font-semibold whitespace-nowrap text-white shadow-soft"
            >
              {game.starting ? (ruleset ? 'Starting the race…' : 'Starting the game…') : 'Pick any square to start'}
            </p>
          )}
          {overlay}
        </div>
      }
      touchControls={<ToolToggle tool={game.tool} onChange={game.setTool} />}
    />
  )
}

/** The way to the Daily Board, beside the modes: a board of its own, played on the server. */
function DailyBoardEntry({ locked, onOpen }: { locked: boolean; onOpen: () => void }) {
  return (
    <section aria-labelledby="daily-board-entry" className="rounded-control bg-surface-muted p-3">
      <h2 id="daily-board-entry" className="flex items-center gap-2 font-display text-base font-semibold">
        <CalendarDays aria-hidden className="size-4" />
        Daily Board
      </h2>
      <p className="mt-1 text-sm text-ink-soft">
        One shared 16 × 16 board a day, the same for everyone. Sign in for your one ranked attempt.
      </p>
      <Button size="sm" variant="secondary" className="mt-2" disabled={locked} onClick={onOpen}>
        Play the Daily Board
      </Button>
      {locked && <p className="mt-2 text-xs text-ink-soft">Open it once this run ends.</p>}
    </section>
  )
}

/**
 * [ Classic ] [ Beginner ] [ Intermediate ] [ Expert ]: the mode the next run is played in, among those
 * the server declares, with the chosen race's objective and a link to its leaderboard. A race chosen
 * while declared that no longer is stays listed, as unavailable.
 */
function ModePicker({
  offered,
  chosen,
  available,
  locked,
  onChange,
}: {
  offered: readonly MinesweeperRuleset[]
  /** The race chosen; none for Classic. */
  chosen?: MinesweeperRuleset
  available: boolean
  /** While a run is under way: it keeps its mode. */
  locked: boolean
  onChange: (mode: string) => void
}) {
  const races = chosen && !available ? TIMED_MODES.filter((option) => offered.includes(option) || option === chosen) : offered
  const options = [
    { mode: CLASSIC, label: 'Classic', missing: false },
    ...races.map((option) => ({ mode: option.mode, label: option.name, missing: !offered.includes(option) })),
  ]
  const selected = chosen?.mode ?? CLASSIC
  return (
    <section className="rounded-control bg-surface-muted p-3">
      <h2 className="mb-2 font-display text-base font-semibold">Mode</h2>
      <div role="group" aria-label="Game mode" className="grid grid-cols-2 gap-1">
        {options.map((option) => {
          const pressed = option.mode === selected
          return (
            <button
              key={option.mode}
              type="button"
              aria-pressed={pressed}
              aria-label={option.missing ? `${option.label}, unavailable` : undefined}
              disabled={!pressed && (locked || option.missing)}
              onClick={() => onChange(option.mode)}
              className={cn(
                'h-9 rounded-xl px-3 font-display font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50',
                pressed ? 'bg-(--accent) text-(--accent-ink) shadow-soft' : 'text-ink-soft hover:bg-surface hover:text-ink',
              )}
            >
              {option.label}
            </button>
          )
        })}
      </div>
      <p className="mt-2 text-sm text-ink-soft">
        {chosen ? chosen.objective : 'Score points for every square you uncover, and more for a fast clear.'}
      </p>
      {chosen && available && (
        <Link
          to={leaderboardPath(chosen.mode)}
          className="mt-2 inline-block text-sm font-semibold text-brand-700 underline-offset-2 hover:underline"
        >
          {chosen.name} leaderboard →
        </Link>
      )}
      {locked && <p className="mt-2 text-xs text-ink-soft">The mode can change once this run ends.</p>}
    </section>
  )
}
