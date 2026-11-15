import { Lock } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/Button'
import { BoardOverlay } from '@/games/shared/components/BoardOverlay'
import { GameShell, Key, type GameStat } from '@/games/shared/components/GameShell'
import type { GameProps } from '@/games/types'
import { cn } from '@/lib/cn'
import { formatGameTime, formatScore } from '@/lib/format'
import type { TetrisAI } from './ai/tetrisAi'
import { NextPieces } from './components/NextPieces'
import { TetrisBoard } from './components/TetrisBoard'
import { TouchControls } from './components/TouchControls'
import { HEIGHT, WIDTH, type TimedRules } from './engine/tetrisEngine'
import { useTetrisGame } from './hooks/useTetrisGame'
import {
  PAUSE_ALLOWANCE_MS,
  SPRINT,
  SPRINT_LINES,
  SPRINT_MODE,
  ULTRA,
  ULTRA_MODE,
  formatClock,
  type TetrisRuleset,
} from './modes'
import { CHALLENGE_STAGES, objectiveOf, risingOf, type ChallengeStage } from './stages'
import { useChallengeProgress } from './challengeProgress'
import type { TetrisAction } from './types/tetrisTypes'

const ACTION_LABELS: Record<TetrisAction, string> = {
  LEFT: 'LEFT',
  RIGHT: 'RIGHT',
  ROTATE_CW: 'ROTATE',
  ROTATE_CCW: 'ROTATE',
  SOFT_DROP: 'DOWN',
  HARD_DROP: 'DROP',
  TICK: 'WAIT',
  STEP: 'WAIT',
}

interface TetrisGameProps extends GameProps<TetrisAI> {
  /** Makes a Classic game timed, unranked, for tests of the clock. Ultra brings its own. */
  timed?: TimedRules
}

/** Each ruleset besides Classic and Challenge (whose stages bring their own): its rules and mode. */
const TIMED_RULESETS: Record<Exclude<TetrisRuleset, 'classic' | 'challenge'>, { timed: TimedRules; mode: string }> = {
  ultra: { timed: ULTRA, mode: ULTRA_MODE },
  sprint: { timed: SPRINT, mode: SPRINT_MODE },
}

/**
 * Tetris's screen: Classic, or Ultra (two minutes of game time), Sprint (40 lines) or Challenge (six
 * stages) when the server offers them. The ruleset, and a Challenge stage, is chosen before a run
 * starts and the board is set up afresh for it, so a run keeps the rules, and the mode, it began with.
 */
export default function TetrisGame({ timed, ...props }: TetrisGameProps) {
  // The stages the server declares, and those open on this device: stage 1, then one per clear.
  const stages = CHALLENGE_STAGES.filter((stage) => props.modes?.includes(stage.mode) === true)
  const progress = useChallengeProgress()
  const open = stages.filter((stage) => stage.id <= progress.highestUnlocked)
  // Classic, then each other ruleset only while the server declares it (Challenge: any open stage).
  const offered = RULESETS.filter(({ ruleset }) =>
    ruleset === 'challenge' ? open.length > 0 : ruleset === 'classic' || props.modes?.includes(ruleset) === true,
  )
  const [chosen, setChosen] = useState<TetrisRuleset>('classic')
  const ruleset: TetrisRuleset = offered.some((option) => option.ruleset === chosen) ? chosen : 'classic'
  // The stage chosen, first the furthest open one. Kept as chosen when a clear opens the next, so the
  // cleared stage's result stays on screen; the player moves on by choosing.
  const [chosenStage, setChosenStage] = useState(progress.highestUnlocked)
  const stage =
    ruleset === 'challenge' ? (open.find(({ id }) => id === chosenStage) ?? open[open.length - 1]) : undefined
  let rules: { timed: TimedRules; mode: string } | undefined
  if (stage) rules = { timed: stage.timed, mode: stage.mode }
  else if (ruleset !== 'classic' && ruleset !== 'challenge') rules = TIMED_RULESETS[ruleset]

  return (
    <TetrisPlay
      key={stage ? stage.mode : ruleset}
      {...props}
      timed={rules ? rules.timed : timed}
      sessionMode={rules?.mode}
      stage={stage}
      lastStage={stages.length}
      stagesCleared={progress.cleared}
      onStageCleared={(cleared) => progress.markCleared(cleared.id)}
      picker={
        offered.length > 1 ? (
          <>
            <RulesetPicker options={offered} ruleset={ruleset} onChange={setChosen} />
            {stage && (
              <StagePicker
                stages={stages}
                highestUnlocked={progress.highestUnlocked}
                selected={stage}
                onChange={setChosenStage}
              />
            )}
          </>
        ) : null
      }
    />
  )
}

interface TetrisPlayProps extends GameProps<TetrisAI> {
  timed?: TimedRules
  sessionMode?: string
  /** The Challenge stage played, if any. */
  stage?: ChallengeStage
  /** How many stages the server declares: after the last, no next one opens. */
  lastStage: number
  /** The highest stage cleared on this device: whether the one after a clear is open yet. */
  stagesCleared: number
  /** A clear of `stage` that the server has recorded. */
  onStageCleared: (stage: ChallengeStage) => void
  /** The choice of ruleset, shown before a human run starts; `null` when only Classic is offered. */
  picker: ReactNode
}

/** One ruleset's game. All behaviour lives in `useTetrisGame`; this only lays it out. */
function TetrisPlay({
  timed,
  sessionMode,
  stage,
  lastStage,
  stagesCleared,
  onStageCleared,
  picker,
  ...props
}: TetrisPlayProps) {
  const game = useTetrisGame(props, timed, sessionMode, stage, onStageCleared)
  const { state, status, isAi } = game
  const ultra = sessionMode === ULTRA_MODE
  const sprint = sessionMode === SPRINT_MODE
  const clock = state.clock
  // A sprint's result: the time of the finished race, or how far a failed attempt got.
  const sprintResult = clock?.goalReached
    ? `You cleared ${SPRINT_LINES} lines in ${formatGameTime(clock.elapsedMs)}.`
    : `You cleared ${state.lines} of ${SPRINT_LINES} lines.`
  // A stage's progress towards its objective, and its result: the time of a clear, or how far it got.
  const garbageLeft = state.challenge ? state.challenge.garbageAdded - state.challenge.garbageCleared : 0
  const lineGoal = stage?.timed.lineGoal
  let stageResult = ''
  if (stage) {
    if (clock?.goalReached) stageResult = `You cleared stage ${stage.id} in ${formatGameTime(clock.elapsedMs)}.`
    else if (stage.rules.dig) stageResult = `${garbageLeft} garbage ${garbageLeft === 1 ? 'row was' : 'rows were'} left.`
    else stageResult = `You cleared ${state.lines} of ${lineGoal} lines.`
  }

  let overlay = null
  if (status === 'over' && game.unranked) {
    overlay = (
      <BoardOverlay
        title={stage ? 'Run not saved' : 'Unranked run'}
        description={`${stage ? stageResult : sprint ? sprintResult : `You scored ${formatScore(state.score)} with ${state.lines} lines.`} It paused for more than a minute in all, so it was not saved.`}
        action={<Button onClick={game.restart}>Play again</Button>}
      />
    )
  } else if (status === 'over' && stage) {
    let title = clock?.timeUp ? "Time's up!" : 'Topped out'
    let description = `${stageResult} Only a cleared stage is saved, so this run was not saved.`
    if (clock?.goalReached) {
      title = 'Stage cleared!'
      let best = ''
      if (!isAi) best = game.newBest ? ' Your fastest yet.' : game.best > 0 ? ` Your best is ${formatGameTime(game.best)}.` : ''
      // Only a player's clear opens the next stage, once the server has saved it; the AI's is never sent.
      let next = ''
      if (!isAi && stage.id === lastStage) next = ' That was the last stage.'
      else if (!isAi && stagesCleared >= stage.id) next = ` Stage ${stage.id + 1} is open.`
      else if (!isAi) next = ` Stage ${stage.id + 1} opens once this clear is saved.`
      description = `${stageResult}${best}${next}`
    }
    overlay = (
      <BoardOverlay title={title} description={description} action={<Button onClick={game.restart}>Play again</Button>} />
    )
  } else if (status === 'over' && sprint) {
    let title = clock?.timeUp ? "Time's up!" : 'Topped out'
    let description = `${sprintResult} Only a finished sprint is ranked, so this run was not saved.`
    if (clock?.goalReached) {
      title = game.newBest ? 'New best!' : 'Finished!'
      description = game.newBest
        ? `${formatGameTime(clock.elapsedMs)} is your fastest sprint yet.`
        : `${sprintResult}${game.best > 0 ? ` Your best is ${formatGameTime(game.best)}.` : ''}`
    }
    overlay = (
      <BoardOverlay title={title} description={description} action={<Button onClick={game.restart}>Play again</Button>} />
    )
  } else if (status === 'over') {
    let title = game.newBest ? 'New best!' : 'Game over'
    if (ultra && !game.newBest) title = clock?.timeUp ? "Time's up!" : 'Topped out'
    overlay = (
      <BoardOverlay
        title={title}
        description={
          game.newBest
            ? `${formatScore(state.score)} is your highest score yet, with ${state.lines} lines.`
            : `You scored ${formatScore(state.score)} with ${state.lines} lines. Your best is ${formatScore(game.best)}.`
        }
        action={<Button onClick={game.restart}>Play again</Button>}
      />
    )
  } else if (status === 'ready') {
    overlay = (
      <BoardOverlay
        title="Ready?"
        description={
          stage ? (
            // A stage says more and adds a row of stages: on a phone-sized board it is set smaller to fit.
            <span className="block text-sm leading-[1.3] sm:text-base sm:leading-normal">
              {`Stage ${stage.id}, ${stage.name}: ${objectiveOf(stage)} within ${formatClock(stage.timed.limitMs ?? 0)}.${risingOf(stage)}${game.best > 0 ? ` Your best: ${formatGameTime(game.best)}.` : ''} Press Enter or tap Start.`}
            </span>
          ) : ultra
              ? 'Score all you can in two minutes. Press Enter or tap Start.'
              : sprint
                ? `Clear ${SPRINT_LINES} lines as fast as you can. Press Enter or tap Start.`
                : 'Press Enter or tap Start.'
        }
        action={
          stage ? (
            <div className="flex flex-col items-center gap-1.5 sm:gap-3">
              {picker}
              <Button onClick={game.start}>Start</Button>
            </div>
          ) : (
            <>
              {picker}
              <Button onClick={game.start}>Start</Button>
            </>
          )
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
  } else if (status === 'paused' && !isAi) {
    overlay = (
      <BoardOverlay
        title="Paused"
        description={game.pauseLeftMs !== null && <PauseLeft ms={game.pauseLeftMs} unranked={game.unranked} stage={stage !== undefined} />}
        action={<Button onClick={game.togglePause}>Resume</Button>}
      />
    )
  }

  // A sprint is raced against the clock: the time so far and the lines towards the goal, not points.
  // A stage: which one, and how far to its objective (then the time left, below).
  let stats: GameStat[]
  if (stage) {
    stats = [
      { label: 'Stage', value: <span className="tabular-nums">{stage.id}/{lastStage}</span> },
      stage.rules.dig
        ? { label: 'Garbage left', value: <span className="tabular-nums">{garbageLeft}</span> }
        : {
            label: 'Lines',
            value: (
              <span className="tabular-nums">
                {state.lines}/{lineGoal}
              </span>
            ),
          },
    ]
  } else stats = sprint
    ? [
        {
          label: 'Lines',
          value: (
            <span className="tabular-nums">
              {state.lines}/{SPRINT_LINES}
            </span>
          ),
        },
        { label: 'Level', value: state.level },
        { label: 'Time', value: <span className="tabular-nums">{formatGameTime(clock?.elapsedMs ?? 0)}</span> },
      ]
    : [
        { label: 'Score', value: state.score },
        { label: 'Lines', value: state.lines },
        { label: 'Level', value: state.level },
      ]
  if (!sprint && clock?.limitMs != null) {
    stats.push({
      label: 'Time left',
      value: <span className="tabular-nums">{formatClock(clock.limitMs - clock.elapsedMs)}</span>,
    })
  }
  if (ultra || sprint || stage) {
    let pauseLeft = formatClock(PAUSE_ALLOWANCE_MS)
    if (game.unranked) pauseLeft = stage ? 'Used up' : 'Unranked'
    else if (game.pauseLeftMs !== null) pauseLeft = formatClock(game.pauseLeftMs)
    else if (status === 'over') pauseLeft = '–'
    stats.push({ label: 'Pause left', value: <span className="tabular-nums">{pauseLeft}</span> })
  }

  return (
    <GameShell
      mode={game.mode}
      onModeChange={game.changeMode}
      aiAvailable={game.aiAvailable}
      onRestart={game.restart}
      pause={{ paused: game.paused, onToggle: game.togglePause, disabled: !game.canPause }}
      stats={stats}
      ai={{
        status: status === 'over' ? 'finished' : status === 'paused' ? 'paused' : 'playing',
        action: game.decision ? ACTION_LABELS[game.decision.action] : undefined,
        detail: game.decision ? `placing the ${state.piece.type} piece` : undefined,
        speed: game.speed,
        onSpeedChange: game.setSpeed,
      }}
      humanHelp={
        <p>
          Move with <Key>←</Key> <Key>→</Key> or <Key>A</Key> <Key>D</Key>, rotate with <Key>↑</Key> or{' '}
          <Key>W</Key>, soft drop with <Key>↓</Key> or <Key>S</Key>, hard drop with <Key>Space</Key>. Press{' '}
          <Key>P</Key> to pause. The pieces fall faster every ten lines.
          {ultra &&
            ' In Ultra the clock starts once the server has opened the run, the board is hidden while paused, and a run that pauses for more than a minute in all is unranked.'}
          {sprint &&
            ` In Sprint the clock starts once the server has opened the run and stops at the clear that reaches ${SPRINT_LINES} lines. The board is hidden while paused, a run that pauses for more than a minute in all is unranked, and a top-out or five minutes without ${SPRINT_LINES} lines is not saved.`}
          {stage &&
            ' In Challenge each stage starts with rows of grey garbage at its own fixed speed: meet its objective before its time runs out. The clock starts once the server has opened the run and stops when the objective is met. The board is hidden while paused, a run that pauses for more than a minute in all is not saved, and neither is a top-out or running out of time. A clear the server has saved opens the next stage; progress and best times are kept on this device only. Challenge has no leaderboard and earns no XP or coins.'}
        </p>
      }
      touchControls={<TouchControls onAction={game.control} />}
      board={
        <div className="flex items-start justify-center gap-3">
          {/*
            The board is twice as tall as it is wide, so its height is capped three ways: a maximum
            size, the viewport height, and (on narrow screens) twice the width left beside "Next".
          */}
          <div className="relative h-[min(38rem,calc(100dvh-13rem),calc((100vw-10.5rem)*2))] min-h-64">
            {game.hideBoard ? (
              // Same size as the board, with nothing of the game on it.
              <div
                role="img"
                aria-label="Board hidden while paused"
                className="h-full rounded-xl bg-surface-muted ring-4 ring-(--accent)/30"
                style={{ aspectRatio: `${WIDTH} / ${HEIGHT}` }}
              />
            ) : (
              <TetrisBoard state={state} target={game.target?.landing} />
            )}
            {game.lineClear && status === 'playing' && (
              // Keyed by the clear so the announcement replays each time, then fades on its own.
              <p
                key={game.lineClear.id}
                aria-hidden
                className="pointer-events-none absolute top-[18%] left-1/2 -translate-x-1/2 rounded-full bg-night px-4 py-1 font-display text-sm font-semibold whitespace-nowrap text-white opacity-0 shadow-soft motion-safe:animate-toast"
              >
                {game.lineClear.label}
              </p>
            )}
            {overlay}
          </div>
          <NextPieces queue={game.hideBoard ? [] : state.queue} />
        </div>
      }
    />
  )
}

/** Warn this far ahead that the pause allowance is about to run out. */
const PAUSE_WARNING_MS = 15_000

/**
 * What is left of a ranked run's pause allowance while paused: the time left, a warning when little
 * is, and once it is used up, that the run is now unranked. Counted by this device; the server keeps
 * its own count of the run's time, and that one decides.
 */
function PauseLeft({ ms, unranked, stage }: { ms: number; unranked: boolean; stage: boolean }) {
  // A Challenge stage is never ranked: what it stands to lose is being saved, and opening the next stage.
  if (stage && (unranked || ms <= 0)) {
    return (
      <span role="alert" className="font-semibold text-danger">
        This run will not be saved: it has paused for more than a minute in all. Play on for practice.
      </span>
    )
  }
  if (stage && ms <= PAUSE_WARNING_MS) {
    return (
      <span role="alert" className="font-semibold text-danger">
        Resume within <span className="tabular-nums">{formatClock(ms)}</span> so that a clear still counts.
      </span>
    )
  }
  if (unranked || ms <= 0) {
    return (
      <span role="alert" className="font-semibold text-danger">
        This run is now unranked: it has paused for more than a minute in all. Play on for practice; it
        will not be saved.
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

interface RulesetOption {
  ruleset: TetrisRuleset
  label: string
}

const RULESETS: RulesetOption[] = [
  { ruleset: 'classic', label: 'Classic' },
  { ruleset: 'ultra', label: 'Ultra' },
  { ruleset: 'sprint', label: 'Sprint' },
  { ruleset: 'challenge', label: 'Challenge' },
]

/** How the picker lays out this many rulesets: one row of up to three, then two rows of two. */
const PICKER_COLUMNS: Record<number, string> = { 2: 'grid-cols-2', 3: 'grid-cols-3', 4: 'grid-cols-2' }

/**
 * [ 1 ] [ 2 ] [🔒] …: which Challenge stage the next run plays. Stage 1 is always open and each clear
 * on this device opens the next; locked stages show a lock and cannot be chosen.
 */
function StagePicker({
  stages,
  highestUnlocked,
  selected,
  onChange,
}: {
  stages: readonly ChallengeStage[]
  highestUnlocked: number
  selected: ChallengeStage
  onChange: (stageId: number) => void
}) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div role="group" aria-label="Challenge stage" className="grid grid-cols-6 gap-1 rounded-control bg-surface-muted p-1">
        {stages.map((option) => {
          const locked = option.id > highestUnlocked
          const isSelected = option.id === selected.id
          return (
            <button
              key={option.id}
              type="button"
              aria-pressed={isSelected}
              aria-label={`Stage ${option.id}: ${option.name}${locked ? ', locked' : ''}`}
              title={locked ? `Clear stage ${option.id - 1} to open it` : option.name}
              disabled={locked}
              onClick={() => onChange(option.id)}
              className={cn(
                'grid h-8 w-8 place-items-center rounded-lg font-display text-sm font-semibold tabular-nums transition-colors',
                isSelected && 'bg-(--accent) text-(--accent-ink) shadow-soft',
                !isSelected && !locked && 'text-ink-soft hover:bg-surface hover:text-ink',
                locked && 'cursor-not-allowed text-ink-soft/50',
              )}
            >
              {locked ? <Lock aria-hidden className="size-3.5" /> : option.id}
            </button>
          )
        })}
      </div>
      <p className="text-[11px] leading-snug text-ink-soft sm:text-xs">Progress and best times are saved on this device only.</p>
    </div>
  )
}

/** [ Classic ] [ Ultra ] [ Sprint ] [ Challenge ]: which rules the next run is played under, among those offered. */
function RulesetPicker({
  options,
  ruleset,
  onChange,
}: {
  options: RulesetOption[]
  ruleset: TetrisRuleset
  onChange: (ruleset: TetrisRuleset) => void
}) {
  return (
    <div
      role="group"
      aria-label="Game mode"
      className={cn('grid gap-1 rounded-control bg-surface-muted p-1', PICKER_COLUMNS[options.length] ?? 'grid-cols-2')}
    >
      {options.map((option) => {
        const selected = option.ruleset === ruleset
        return (
          <button
            key={option.ruleset}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(option.ruleset)}
            className={cn(
              'h-9 rounded-xl font-display font-semibold transition-colors',
              // Four in a 2×2 grid on a phone-sized board: a smaller label, so "Challenge" fits its half.
              options.length === 4 ? 'px-1.5 text-sm sm:px-4 sm:text-base' : 'px-4',
              selected ? 'bg-(--accent) text-(--accent-ink) shadow-soft' : 'text-ink-soft hover:bg-surface hover:text-ink',
            )}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
