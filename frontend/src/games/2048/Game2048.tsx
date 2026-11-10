import { Check, Lock } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/Button'
import { BoardOverlay } from '@/games/shared/components/BoardOverlay'
import { GameShell, Key, type GameStat } from '@/games/shared/components/GameShell'
import { usePlaySession, type PlaySession } from '@/games/shared/usePlaySession'
import { useSwipe } from '@/games/shared/useSwipe'
import type { GameProps } from '@/games/types'
import { cn } from '@/lib/cn'
import { formatGameTime, formatScore } from '@/lib/format'
import type { Game2048AI } from './ai/game2048Ai'
import { Board2048 } from './components/Board2048'
import { PUZZLE_STAGES, type PuzzleStage } from './engine/game2048Puzzles'
import { useGame2048 } from './hooks/useGame2048'
import {
  CLASSIC,
  PAUSE_ALLOWANCE_MS,
  PUZZLE,
  PUZZLE_MODES,
  RULESETS,
  findRuleset,
  formatClock,
  type Game2048Ruleset,
} from './modes'
import { usePuzzleProgress } from './puzzleProgress'

/**
 * 2048's screen: Classic, or Moves Limit, Time Attack and the Puzzle stages while the server declares
 * them. The ruleset is chosen between runs and the game set up afresh for it, so a run keeps the mode
 * it began with. Who plays (Human or AI) and the AI's speed carry over from one ruleset to the other.
 * Puzzle stages open one by one on this device, each once the server has saved a clear of the one
 * before.
 */
export default function Game2048(props: GameProps<Game2048AI>) {
  const session = usePlaySession()
  // Classic, then each ruleset and each stage only while the server declares its mode.
  const offered = RULESETS.filter((option) => props.modes?.includes(option.mode) === true)
  const stages = PUZZLE_MODES.filter((option) => props.modes?.includes(option.mode) === true)
  const progress = usePuzzleProgress()
  const [chosen, setChosen] = useState(CLASSIC)
  const ruleset = findRuleset(chosen)
  // A ruleset or stage chosen while it was declared stays chosen if it no longer is: its runs are never
  // reported as Classic. It can still be watched (AI), but a human run of it does not start.
  const available = ruleset ? (ruleset.stage ? stages : offered).includes(ruleset) : true

  const choose = (mode: string) => {
    // Puzzle opens on the furthest stage this device may play, and stays on the stage already chosen.
    if (mode === PUZZLE && ruleset?.stage) return
    const next = mode === PUZZLE ? puzzleEntry(stages, progress.highestUnlocked) : mode
    if (next === chosen) return
    session.setPaused(false)
    setChosen(next)
  }

  return (
    <Game2048Play
      key={chosen}
      {...props}
      session={session}
      ruleset={ruleset}
      available={available}
      offered={offered}
      stages={stages}
      stagesCleared={progress.cleared}
      highestUnlocked={progress.highestUnlocked}
      onStageCleared={(cleared) => progress.markCleared(cleared.number)}
      onChoose={choose}
    />
  )
}

/**
 * The stage Puzzle opens on: the furthest open stage the server declares. With none declared that
 * this device may play, the furthest open stage all the same, shown as unavailable: never Classic.
 */
function puzzleEntry(stages: readonly Game2048Ruleset[], highestUnlocked: number): string {
  const open = stages.filter((option) => (option.stage?.number ?? 0) <= highestUnlocked)
  return open.at(-1)?.mode ?? PUZZLE_MODES[highestUnlocked - 1].mode
}

interface Game2048PlayProps extends GameProps<Game2048AI> {
  session: PlaySession
  /** The ruleset played; without one, Classic. */
  ruleset?: Game2048Ruleset
  available: boolean
  /** The rulesets the server declares: with none (and no stage), only Classic is offered and no picker is shown. */
  offered: readonly Game2048Ruleset[]
  /** The Puzzle stages the server declares: with none, Puzzle is not offered. */
  stages: readonly Game2048Ruleset[]
  /** The highest Puzzle stage cleared on this device, and the highest open to play. */
  stagesCleared: number
  highestUnlocked: number
  /** A human clear of a Puzzle stage, once the server has saved it. */
  onStageCleared: (stage: PuzzleStage) => void
  onChoose: (mode: string) => void
}

/** One ruleset's game. All behaviour lives in `useGame2048`; this only lays it out. */
function Game2048Play({
  session,
  ruleset,
  available,
  offered,
  stages,
  stagesCleared,
  highestUnlocked,
  onStageCleared,
  onChoose,
  ...props
}: Game2048PlayProps) {
  const game = useGame2048(props, session, ruleset, available, onStageCleared)
  const { stage } = game
  // The stage after this one, once it is open and declared: offered from a clear.
  const nextStage = stage && stages.find((option) => option.stage?.number === stage.number + 1)
  const next = nextStage && stage.number + 1 <= highestUnlocked ? nextStage.mode : undefined
  const { state, status, isAi } = game
  const swipe = useSwipe(game.play)

  const playAgain = <Button onClick={game.restart}>Play again</Button>
  let overlay = null
  if (status === 'over' && game.unranked) {
    overlay = (
      <BoardOverlay
        title="Unranked run"
        description={`You scored ${formatScore(state.score)} with a best tile of ${game.highestTile}. It paused for more than a minute in all, so it was not saved.`}
        action={playAgain}
      />
    )
  } else if (ruleset && game.timed && status === 'over') {
    overlay = timeAttackOverlay(game, playAgain)
  } else if (stage && status === 'over') {
    overlay = puzzleOverlay(stage, game, { stagesCleared, next, playAgain, onChoose })
  } else if (ruleset && status === 'over') {
    overlay = movesLimitOverlay(ruleset, game, playAgain)
  } else if (status === 'over') {
    overlay = (
      <BoardOverlay
        title={game.newBest ? 'New best!' : 'Game over'}
        description={
          game.newBest
            ? `${formatScore(state.score)} is your highest score yet. Best tile: ${game.highestTile}.`
            : `No moves left. You scored ${formatScore(state.score)} with a best tile of ${game.highestTile}.`
        }
        action={playAgain}
      />
    )
  } else if (status === 'won') {
    overlay = (
      <BoardOverlay
        title="You made 2048!"
        description="That's a win. Keep going for an even bigger tile, or bank it and start fresh."
        action={
          <div className="flex flex-wrap justify-center gap-3">
            <Button onClick={game.keepGoing}>Keep going</Button>
            <Button variant="secondary" onClick={game.restart}>
              New game
            </Button>
          </div>
        }
      />
    )
  } else if (!isAi && game.connection === 'opening') {
    overlay = (
      <BoardOverlay
        title="Starting…"
        description="Waiting for the server to open the run. The clock starts when it has; after a quiet spell this can take up to a minute."
      />
    )
  } else if (!isAi && game.connection === 'failed') {
    overlay = (
      <BoardOverlay
        title="Couldn't start the run"
        description="The server could not be reached, so the run has not started and nothing was recorded."
        action={<Button onClick={game.restart}>Try again</Button>}
      />
    )
  } else if (!isAi && game.timed && status === 'paused') {
    overlay = (
      <BoardOverlay
        title="Paused"
        description={game.pauseLeftMs !== null && <PauseLeft ms={game.pauseLeftMs} unranked={game.unranked} />}
        action={<Button onClick={game.togglePause}>Resume</Button>}
      />
    )
  } else if (ruleset && !available && !isAi && !game.started) {
    overlay = (
      <BoardOverlay
        title={stage ? 'Stage unavailable' : `${ruleset.name} unavailable`}
        description={
          stage
            ? `Stage ${stage.number}, ${stage.name}, cannot be played right now.`
            : `${ruleset.name} cannot be played for a score right now.`
        }
        action={<Button onClick={() => onChoose(CLASSIC)}>Play Classic</Button>}
      />
    )
  }

  let stats: GameStat[]
  if (stage) {
    // Puzzle: the score, the stage's target, and the moves used and left. No best: a stage is cleared or not.
    stats = [
      { label: 'Score', value: state.score },
      { label: 'Target', value: stage.target },
      { label: 'Moves used', value: state.moves },
      { label: 'Moves left', value: game.movesLeft ?? 0 },
    ]
  } else if (ruleset && game.timed) {
    // Time Attack: the score, the time left and played, and for a ranked human run its pause allowance.
    const elapsedMs = state.clock?.elapsedMs ?? 0
    stats = [
      { label: 'Score', value: state.score },
      isAi ? { label: 'Best tile', value: game.highestTile } : { label: 'Best', value: Math.max(game.best, state.score) },
      { label: 'Time left', value: <span className="tabular-nums">{formatClock(game.timeLeftMs ?? 0)}</span> },
      { label: 'Played', value: <span className="tabular-nums">{formatGameTime(elapsedMs)}</span> },
    ]
    if (!isAi) {
      let pauseLeft = formatClock(PAUSE_ALLOWANCE_MS)
      if (game.unranked) pauseLeft = 'Unranked'
      else if (game.pauseLeftMs !== null) pauseLeft = formatClock(game.pauseLeftMs)
      else if (game.pauseLeftAtEndMs !== null) pauseLeft = formatClock(game.pauseLeftAtEndMs)
      stats.push({ label: 'Pause left', value: <span className="tabular-nums">{pauseLeft}</span> })
    }
  } else if (ruleset) {
    // Moves Limit: the score against the device's best, and the moves used and left.
    stats = [
      { label: 'Score', value: state.score },
      isAi ? { label: 'Best tile', value: game.highestTile } : { label: 'Best', value: Math.max(game.best, state.score) },
      { label: 'Moves used', value: state.moves },
      { label: 'Moves left', value: game.movesLeft ?? 0 },
    ]
  } else if (isAi) {
    stats = [
      { label: 'Score', value: state.score },
      { label: 'Best tile', value: game.highestTile },
      { label: 'Moves', value: state.moves },
    ]
  } else {
    stats = [
      { label: 'Score', value: state.score },
      { label: 'Best', value: Math.max(game.best, state.score) },
      { label: 'Best tile', value: game.highestTile },
    ]
  }

  return (
    <GameShell
      mode={game.mode}
      onModeChange={game.changeMode}
      aiAvailable={game.aiAvailable}
      onRestart={game.restart}
      // A turn-based game has nothing to pause for a human, except against the clock (Time Attack, which
      // hides the board while paused); AI playback can always be paused.
      pause={
        isAi || game.timed ? { paused: game.paused, onToggle: game.togglePause, disabled: !game.canPause } : undefined
      }
      stats={stats}
      ai={{
        status: status === 'over' ? 'finished' : status === 'paused' ? 'paused' : 'playing',
        action: game.decision?.action,
        detail: game.decision ? `looking ${game.decision.depth + 1} moves ahead` : undefined,
        speed: game.speed,
        onSpeedChange: game.setSpeed,
      }}
      sidebarExtra={
        offered.length > 0 || stages.length > 0 ? (
          <>
            <RulesetPicker
              offered={offered}
              puzzle={stages.length > 0}
              selected={stage ? PUZZLE : (ruleset?.mode ?? CLASSIC)}
              objective={ruleset?.objective}
              locked={game.runInProgress}
              onChange={onChoose}
            />
            {stage && (
              <StagePicker
                declared={stages}
                cleared={stagesCleared}
                highestUnlocked={highestUnlocked}
                selected={stage.mode}
                locked={game.runInProgress}
                onChange={onChoose}
              />
            )}
          </>
        ) : undefined
      }
      humanHelp={
        <p>
          Slide with <Key>←</Key> <Key>↑</Key> <Key>↓</Key> <Key>→</Key>, <Key>W</Key> <Key>A</Key> <Key>S</Key>{' '}
          <Key>D</Key> or a swipe. Matching tiles merge.{' '}
          {stage ? (
            <>
              In <strong className="text-ink">Puzzle</strong> each stage starts from a fixed board: make its target
              tile within its moves; a move that changes nothing is free. Using every move, or running out of moves to
              make, fails the stage and is not saved. A clear the server has saved opens the next stage; progress is
              kept on this device only. Puzzle has no leaderboard and earns no XP or coins.
            </>
          ) : ruleset && game.timed ? (
            <>
              In <strong className="text-ink">{ruleset.name}</strong> you have {formatClock(ruleset.timeLimitMs ?? 0)}{' '}
              of game time. The clock starts with your first move (once the server has opened the run) and runs while you
              think. Pause with <Key>P</Key>: the board is hidden while paused, and a run that pauses for more than a
              minute in all, a hidden tab included, is unranked. Only a run that lasts until the time is up earns the
              completion reward.
            </>
          ) : ruleset ? (
            <>
              In <strong className="text-ink">{ruleset.name}</strong> you have {ruleset.moveLimit} moves; a move that
              changes nothing is free. The run ends after the last one, or sooner when no move is left. Only a run that
              uses every move earns the completion reward.
            </>
          ) : (
            <>
              Make <strong className="text-ink">2048</strong> to win, then keep going if you like.
            </>
          )}
        </p>
      }
      board={
        <div {...(isAi ? {} : swipe)} className="relative aspect-square w-full max-w-[30rem] touch-none">
          {game.hideBoard ? (
            // Same size as the board, with no tile on it: a pause gives no time to plan.
            <div
              role="img"
              aria-label="Board hidden while paused"
              className="size-full rounded-card bg-surface-muted ring-4 ring-(--accent)/30"
            />
          ) : (
            <Board2048 state={state} slideMs={game.slideMs} />
          )}
          {state.won && status === 'playing' && !game.hideBoard && (
            <p className="pointer-events-none absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-night px-4 py-1 font-display text-sm font-semibold whitespace-nowrap text-white shadow-soft motion-safe:animate-pop-in">
              2048 reached!
            </p>
          )}
          {overlay}
        </div>
      }
    />
  )
}

/** The end of a Time Attack run: the time is up, or stuck before it. */
function timeAttackOverlay(game: ReturnType<typeof useGame2048>, playAgain: ReactNode) {
  const { state, isAi } = game
  const who = isAi ? 'The AI' : 'You'
  const elapsedMs = state.clock?.elapsedMs ?? 0
  const result = `${who} scored ${formatScore(state.score)} in ${state.moves} ${state.moves === 1 ? 'move' : 'moves'}, with a best tile of ${game.highestTile}.`
  if (game.timeOutcome === 'stuck') {
    return (
      <BoardOverlay
        title={!isAi && game.newBest ? 'New best!' : 'No moves left'}
        description={`Stuck with ${formatClock(game.timeLeftMs ?? 0)} to go, after ${formatGameTime(elapsedMs)}. ${result}${
          isAi ? '' : ' Only a run that lasts until the time is up earns the completion reward.'
        }`}
        action={playAgain}
      />
    )
  }
  return (
    <BoardOverlay
      title={!isAi && game.newBest ? 'New best!' : "Time's up!"}
      description={`${result}${!isAi && game.newBest ? ' Your best in Time Attack yet.' : ''}`}
      action={playAgain}
    />
  )
}

/** Warn this far ahead that the pause allowance is about to run out. */
const PAUSE_WARNING_MS = 15_000

/**
 * What is left of a Time Attack run's pause allowance while paused: the time left, a warning when
 * little is, and once it is used up, that the run is now unranked. Counted by this device; the server
 * keeps its own count of the run's time, and that one decides.
 */
function PauseLeft({ ms, unranked }: { ms: number; unranked: boolean }) {
  if (unranked || ms <= 0) {
    return (
      <span role="alert" className="font-semibold text-danger">
        This run is now unranked: it has paused for more than a minute in all. Play on for practice; it will not be
        saved.
      </span>
    )
  }
  if (ms <= PAUSE_WARNING_MS) {
    return (
      <span role="alert" className="font-semibold text-danger">
        Resume within <span className="tabular-nums">{formatClock(ms)}</span> to keep this run ranked.
      </span>
    )
  }
  return (
    <span>
      Pause time left: <strong className="tabular-nums">{formatClock(ms)}</strong>
    </span>
  )
}

/** The end of a Puzzle stage: its target made, every move used without it, or stuck before. */
function puzzleOverlay(
  stage: PuzzleStage,
  game: ReturnType<typeof useGame2048>,
  {
    stagesCleared,
    next,
    playAgain,
    onChoose,
  }: { stagesCleared: number; next?: string; playAgain: ReactNode; onChoose: (mode: string) => void },
) {
  const { state, isAi } = game
  const tile = `Best tile: ${game.highestTile}.`
  const notSaved = isAi ? '' : ' Only a cleared stage is saved.'
  if (game.puzzleOutcome === 'cleared') {
    let result = `${isAi ? 'The AI' : 'You'} made the ${stage.target} in ${state.moves} of ${stage.moveLimit} moves, scoring ${formatScore(state.score)}.`
    if (!isAi) {
      // Only a player's clear opens the next stage, once the server has saved it; the AI's is never sent.
      if (stage.number >= PUZZLE_STAGES.length) result += ' That was the last stage.'
      else if (stagesCleared >= stage.number) result += ` Stage ${stage.number + 1} is open.`
      else result += ` Stage ${stage.number + 1} opens once this clear is saved.`
    }
    const action = next ? (
      <div className="flex flex-wrap justify-center gap-3">
        <Button onClick={() => onChoose(next)}>Next stage</Button>
        <Button variant="secondary" onClick={game.restart}>
          Play again
        </Button>
      </div>
    ) : (
      playAgain
    )
    return <BoardOverlay title="Stage cleared!" description={result} action={action} />
  }
  if (game.puzzleOutcome === 'stuck') {
    return (
      <BoardOverlay
        title="No moves left"
        description={`Stuck after ${state.moves} of ${stage.moveLimit} moves, short of the ${stage.target}. ${tile}${notSaved}`}
        action={playAgain}
      />
    )
  }
  return (
    <BoardOverlay
      title="Out of moves"
      description={`All ${stage.moveLimit} moves used without making the ${stage.target}. ${tile}${notSaved}`}
      action={playAgain}
    />
  )
}

/** The end of a Moves Limit run: every move used, or stuck before the limit. */
function movesLimitOverlay(
  ruleset: Game2048Ruleset,
  game: ReturnType<typeof useGame2048>,
  playAgain: ReactNode,
) {
  const { state, isAi } = game
  const who = isAi ? 'The AI' : 'You'
  const result = `${who} scored ${formatScore(state.score)} with a best tile of ${game.highestTile}.`
  if (game.outcome === 'stuck') {
    const description = `Stuck after ${state.moves} of ${ruleset.moveLimit} moves. ${result}${
      isAi ? '' : ' Only a run that uses every move earns the completion reward.'
    }`
    return (
      <BoardOverlay
        title={!isAi && game.newBest ? 'New best!' : 'No moves left'}
        description={description}
        action={playAgain}
      />
    )
  }
  return (
    <BoardOverlay
      title={!isAi && game.newBest ? 'New best!' : 'Out of moves'}
      description={`All ${ruleset.moveLimit} moves used. ${result}${
        !isAi && game.newBest ? ` Your best in ${ruleset.name} yet.` : ''
      }`}
      action={playAgain}
    />
  )
}

/** [ Classic ] [ Moves Limit ] [ Time Attack ] [ Puzzle ]: the ruleset the next run is played under, among those offered. */
function RulesetPicker({
  offered,
  puzzle,
  selected,
  objective,
  locked,
  onChange,
}: {
  offered: readonly Game2048Ruleset[]
  /** Whether Puzzle is offered: the server declares at least one of its stages. */
  puzzle: boolean
  /** The mode chosen, or {@link PUZZLE} while a stage is. */
  selected: string
  /** The chosen ruleset's objective; none for Classic. */
  objective?: string
  /** While a human run is under way: it keeps its ruleset. */
  locked: boolean
  onChange: (mode: string) => void
}) {
  const options = [
    { mode: CLASSIC, label: 'Classic' },
    ...offered.map((option) => ({ mode: option.mode, label: option.name })),
    ...(puzzle ? [{ mode: PUZZLE, label: 'Puzzle' }] : []),
  ]
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
              disabled={locked && !pressed}
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
      <p className="mt-2 text-sm text-ink-soft">{objective ?? 'Play on as long as you can. Make 2048 to win.'}</p>
      {locked && <p className="mt-2 text-xs text-ink-soft">The mode can change once this run ends.</p>}
    </section>
  )
}

/**
 * [ 1✓ ] [ 2 ] [🔒] …: which Puzzle stage the next run plays. Stage 1 is always open and each clear the
 * server has saved on this device opens the next; a cleared stage shows a check, a locked one a lock
 * and cannot be chosen, nor can one the server does not declare.
 */
function StagePicker({
  declared,
  cleared,
  highestUnlocked,
  selected,
  locked,
  onChange,
}: {
  declared: readonly Game2048Ruleset[]
  cleared: number
  highestUnlocked: number
  selected: string
  /** While a human run is under way: it keeps its stage. */
  locked: boolean
  onChange: (mode: string) => void
}) {
  return (
    <section className="rounded-control bg-surface-muted p-3">
      <h2 className="mb-2 font-display text-base font-semibold">Puzzle</h2>
      <div role="group" aria-label="Puzzle stage" className="grid grid-cols-6 gap-1">
        {PUZZLE_MODES.map((option) => {
          const { stage } = option
          if (!stage) return null
          const closed = stage.number > highestUnlocked
          const done = stage.number <= cleared
          const missing = !declared.includes(option)
          const pressed = option.mode === selected
          let state = ''
          if (closed) state = ', locked'
          else if (missing) state = ', unavailable'
          else if (done) state = ', cleared'
          let title = option.objective
          if (closed) title = `Clear stage ${stage.number - 1} to open it`
          else if (missing) title = 'Not available right now'
          return (
            <button
              key={option.mode}
              type="button"
              aria-pressed={pressed}
              aria-label={`Stage ${stage.number}: ${stage.name}, make a ${stage.target} within ${stage.moveLimit} moves${state}`}
              title={title}
              disabled={!pressed && (closed || missing || locked)}
              onClick={() => onChange(option.mode)}
              className={cn(
                'grid h-9 place-items-center rounded-xl font-display text-sm font-semibold tabular-nums transition-colors disabled:cursor-not-allowed',
                pressed && 'bg-(--accent) text-(--accent-ink) shadow-soft',
                !pressed && !closed && 'text-ink-soft hover:bg-surface hover:text-ink disabled:opacity-50',
                closed && 'text-ink-soft/50',
              )}
            >
              {closed ? (
                <Lock aria-hidden className="size-3.5" />
              ) : (
                <span className="inline-flex items-center gap-0.5">
                  {stage.number}
                  {done && <Check aria-hidden className="size-3" />}
                </span>
              )}
            </button>
          )
        })}
      </div>
      <p className="mt-2 text-xs text-ink-soft">
        {Math.min(cleared, PUZZLE_STAGES.length)} of {PUZZLE_STAGES.length} cleared. Progress is saved on this device
        only.
      </p>
    </section>
  )
}
