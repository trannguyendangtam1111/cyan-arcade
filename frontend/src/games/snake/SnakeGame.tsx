import { useState, type ReactNode } from 'react'
import { Lock } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { BoardOverlay } from '@/games/shared/components/BoardOverlay'
import { DirectionPad } from '@/games/shared/components/DirectionPad'
import { GameShell, Key } from '@/games/shared/components/GameShell'
import { usePlaySession, type PlaySession } from '@/games/shared/usePlaySession'
import { useSwipe } from '@/games/shared/useSwipe'
import type { GameProps } from '@/games/types'
import { cn } from '@/lib/cn'
import { formatGameTime } from '@/lib/format'
import { useAdventureProgress } from './adventureProgress'
import type { SnakeAI, SnakeStrategy } from './ai/snakeAi'
import { SnakeBoard } from './components/SnakeBoard'
import { adventureOutcome, movesLeft } from './engine/snakeEngine'
import { useSnakeGame } from './hooks/useSnakeGame'
import { ADVENTURE_MODES, MAP_MODES, MAP_OBJECTIVE, objectiveOf, type SnakeAdventureMode, type SnakeMapMode } from './modes'

const STRATEGY_LABELS: Record<SnakeStrategy, string> = {
  shortcut: 'shortcut to the food',
  loop: 'following the safe loop',
  path: 'shortest safe path',
  survive: 'keeping space open',
  trapped: 'no way out',
}

const CLASSIC = 'classic'

/**
 * Snake's screen: Classic, one of the maps, or an Adventure stage, the last two only while the server
 * declares them. The board is chosen between runs and set up afresh for it, so a run keeps the board,
 * and the mode, it began with. Who plays (Human or AI) and the AI's speed carry over from one to the
 * next. Adventure stages open one by one on this device, each once the server has saved a clear of
 * the one before.
 */
export default function SnakeGame(props: GameProps<SnakeAI>) {
  const session = usePlaySession()
  // Classic, then each map and each stage only while the server declares its mode.
  const offered = MAP_MODES.filter((option) => props.modes?.includes(option.mode) === true)
  const stages = ADVENTURE_MODES.filter((option) => props.modes?.includes(option.mode) === true)
  const progress = useAdventureProgress()
  const [chosen, setChosen] = useState(CLASSIC)
  const choice = MAP_MODES.find((option) => option.mode === chosen)
  const stage = ADVENTURE_MODES.find((option) => option.mode === chosen)
  // A map or stage chosen while it was declared stays chosen if it no longer is: its runs are never
  // reported as Classic. It can still be watched (AI), but a human run of it does not start.
  const available = choice ? offered.includes(choice) : stage ? stages.includes(stage) : true

  const choose = (mode: string) => {
    if (mode === chosen) return
    session.setPaused(false)
    setChosen(mode)
  }

  return (
    <SnakePlay
      key={chosen}
      {...props}
      session={session}
      choice={choice}
      stage={stage}
      available={available}
      maps={offered}
      stages={stages}
      stagesCleared={progress.cleared}
      highestUnlocked={progress.highestUnlocked}
      onStageCleared={(cleared) => progress.markCleared(cleared.id)}
      onChoose={choose}
    />
  )
}

interface SnakePlayProps extends GameProps<SnakeAI> {
  session: PlaySession
  /** The map played, if any. */
  choice?: SnakeMapMode
  /** The Adventure stage played, if any. Neither: Classic. */
  stage?: SnakeAdventureMode
  available: boolean
  /** The maps the server declares: with none, only Classic is offered and no picker is shown. */
  maps: readonly SnakeMapMode[]
  /** The Adventure stages the server declares: with none, Adventure is not offered. */
  stages: readonly SnakeAdventureMode[]
  /** The highest stage cleared on this device: whether the one after a clear is open yet. */
  stagesCleared: number
  /** The highest stage open on this device. */
  highestUnlocked: number
  /** A clear of a stage that the server has recorded. */
  onStageCleared: (stage: SnakeAdventureMode['stage']) => void
  onChoose: (mode: string) => void
}

/** One board's game (Classic's, a map's or a stage's). All behaviour lives in `useSnakeGame`; this only lays it out. */
function SnakePlay({
  session,
  choice,
  stage,
  available,
  maps,
  stages,
  stagesCleared,
  highestUnlocked,
  onStageCleared,
  onChoose,
  ...props
}: SnakePlayProps) {
  const map = choice?.map ?? stage?.map
  const game = useSnakeGame(
    props,
    session,
    map,
    choice?.mode ?? stage?.mode,
    available,
    stage && { stage: stage.stage, onCleared: onStageCleared },
  )
  const { state, status, isAi } = game
  const swipe = useSwipe(game.steer)

  const playAgain = <Button onClick={game.restart}>Play again</Button>
  let overlay = null
  if (stage) {
    overlay = stageOverlay(stage, game, { available, stagesCleared, lastStage: stages.length, playAgain, onChoose })
  } else if (status === 'won') {
    overlay = map ? (
      <BoardOverlay title="Map cleared!" description={`The snake filled every free cell of ${map.name}.`} action={playAgain} />
    ) : (
      <BoardOverlay title="Board cleared!" description="The snake filled every single cell." action={playAgain} />
    )
  } else if (status === 'over') {
    overlay = (
      <BoardOverlay
        title={game.newBest ? 'New best!' : 'Game over'}
        description={
          game.newBest
            ? `${state.score} is your highest score yet${map ? ` on ${map.name}` : ''}.`
            : `You scored ${state.score}. Your best${map ? ` on ${map.name}` : ''} is ${game.best}.`
        }
        action={playAgain}
      />
    )
  } else if (status === 'ready' && !available && choice) {
    overlay = (
      <BoardOverlay
        title="Map unavailable"
        description={`${choice.map.name} cannot be played for a score right now.`}
        action={<Button onClick={() => onChoose(CLASSIC)}>Play Classic</Button>}
      />
    )
  } else if (status === 'ready') {
    overlay = (
      <BoardOverlay
        title="Ready?"
        description={
          choice ? (
            <span className="block text-sm leading-snug sm:text-base sm:leading-normal">
              <strong className="font-semibold text-ink">{choice.map.name}.</strong> {choice.description} {MAP_OBJECTIVE}{' '}
              Press an arrow key or swipe to start.
            </span>
          ) : (
            'Press an arrow key or swipe to start.'
          )
        }
      />
    )
  } else if (status === 'paused' && !isAi) {
    overlay = <BoardOverlay title="Paused" action={<Button onClick={game.togglePause}>Resume</Button>} />
  }

  let stats
  if (stage) {
    // A stage: which one, and how far to its objective, the moves left (or used) and its game time.
    const left = movesLeft(state)
    stats = [
      { label: 'Stage', value: <span className="tabular-nums">{stage.stage.id}/{stages.length || ADVENTURE_MODES.length}</span> },
      { label: 'Apples', value: <span className="tabular-nums">{state.score}/{stage.stage.objective.apples}</span> },
      left === null ? { label: 'Moves', value: state.steps } : { label: 'Moves left', value: <span className="tabular-nums">{left}</span> },
      { label: 'Time', value: <span className="tabular-nums">{formatGameTime(game.gameMs)}</span> },
    ]
  } else if (isAi) {
    stats = [
      { label: 'Score', value: state.score },
      { label: 'Length', value: state.snake.length },
      { label: 'Moves', value: state.steps },
    ]
  } else {
    stats = [
      { label: 'Score', value: state.score },
      { label: 'Best', value: Math.max(game.best, state.score) },
      { label: 'Level', value: game.level },
    ]
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
        status: status === 'over' || status === 'won' ? 'finished' : status === 'paused' ? 'paused' : 'playing',
        action: game.decision?.action,
        detail: game.decision ? STRATEGY_LABELS[game.decision.strategy] : undefined,
        speed: game.speed,
        onSpeedChange: game.setSpeed,
      }}
      sidebarExtra={
        maps.length > 0 || stages.length > 0 ? (
          <>
            <MapPicker
              maps={maps}
              selected={choice?.mode ?? stage?.mode ?? CLASSIC}
              locked={game.runInProgress}
              onChange={onChoose}
            />
            {stages.length > 0 && (
              <StagePicker
                stages={stages}
                highestUnlocked={highestUnlocked}
                selected={stage?.mode}
                locked={game.runInProgress}
                onChange={onChoose}
              />
            )}
          </>
        ) : undefined
      }
      humanHelp={
        <p>
          Steer with <Key>←</Key> <Key>↑</Key> <Key>↓</Key> <Key>→</Key> or <Key>W</Key> <Key>A</Key> <Key>S</Key>{' '}
          <Key>D</Key>. Press <Key>P</Key> to pause. Every five apples the snake speeds up a level.
          {map && ' Walls end the run, just like the edge.'}
          {stage &&
            ' In Adventure each stage has a fixed board and apples: meet its objective to clear it. A crash, or running out of moves, fails it and is not saved. A clear the server has saved opens the next stage; progress and best times are kept on this device only. Adventure has no leaderboard and earns no XP or coins.'}
        </p>
      }
      touchControls={<DirectionPad onPress={game.steer} />}
      board={
        <div
          {...(isAi ? {} : swipe)}
          className={cn(
            'relative aspect-square w-full max-w-[32rem] touch-none overflow-hidden rounded-card ring-4 ring-(--accent)/30',
            status === 'over' && 'motion-safe:animate-shake',
          )}
        >
          <SnakeBoard state={state} eaten={game.eaten} mapName={map?.name} />
          {overlay}
        </div>
      }
    />
  )
}

/** [ Classic ] [ Pillars ] [ Tunnels ] [ Rooms ]: the board the next run is played on, among those offered. */
function MapPicker({
  maps,
  selected,
  locked,
  onChange,
}: {
  maps: readonly SnakeMapMode[]
  selected: string
  /** While a human run is under way: it keeps its map. */
  locked: boolean
  onChange: (mode: string) => void
}) {
  const options = [{ mode: CLASSIC, label: 'Classic' }, ...maps.map((option) => ({ mode: option.mode, label: option.map.name }))]
  return (
    <section className="rounded-control bg-surface-muted p-3">
      <h2 className="mb-2 font-display text-base font-semibold">Map</h2>
      <div role="group" aria-label="Map" className="grid grid-cols-2 gap-1">
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
      {locked && <p className="mt-2 text-xs text-ink-soft">The map can change once this run ends.</p>}
    </section>
  )
}

/** The overlay of an Adventure stage: its objective before the run, then a clear, a crash or running out of moves. */
function stageOverlay(
  stage: SnakeAdventureMode,
  game: ReturnType<typeof useSnakeGame>,
  {
    available,
    stagesCleared,
    lastStage,
    playAgain,
    onChoose,
  }: { available: boolean; stagesCleared: number; lastStage: number; playAgain: ReactNode; onChoose: (mode: string) => void },
) {
  const { state, status, isAi } = game
  const { id, objective } = stage.stage
  const eaten = `${state.score} of ${objective.apples} apples`
  if (status === 'won') {
    let result = `${isAi ? 'The AI' : 'You'} ate ${objective.apples} apples in ${state.steps} moves, in ${formatGameTime(game.gameMs)}.`
    if (!isAi) {
      if (game.newBest) result += ' Your fastest yet.'
      else if (game.best > 0) result += ` Your best is ${formatGameTime(game.best)}.`
      // Only a player's clear opens the next stage, once the server has saved it; the AI's is never sent.
      if (id >= lastStage) result += ' That was the last stage.'
      else if (stagesCleared >= id) result += ` Stage ${id + 1} is open.`
      else result += ` Stage ${id + 1} opens once this clear is saved.`
    }
    return <BoardOverlay title="Stage cleared!" description={result} action={playAgain} />
  }
  if (status === 'over') {
    const notSaved = isAi ? '' : ' Only a cleared stage is saved.'
    return adventureOutcome(state) === 'out-of-moves' ? (
      <BoardOverlay
        title="Out of moves"
        description={`All ${objective.moveLimit} moves were used with ${eaten} eaten.${notSaved}`}
        action={playAgain}
      />
    ) : (
      <BoardOverlay title="Crashed" description={`The snake crashed with ${eaten} eaten.${notSaved}`} action={playAgain} />
    )
  }
  if (status === 'ready' && !available) {
    return (
      <BoardOverlay
        title="Stage unavailable"
        description={`Stage ${id} cannot be played right now.`}
        action={<Button onClick={() => onChoose(CLASSIC)}>Play Classic</Button>}
      />
    )
  }
  if (status === 'ready') {
    return (
      <BoardOverlay
        title="Ready?"
        description={
          <span className="block text-sm leading-snug sm:text-base sm:leading-normal">
            <strong className="font-semibold text-ink">
              Stage {id}, {stage.board}.
            </strong>{' '}
            {objectiveOf(stage.stage)}
            {stage.map ? ' Walls end the run.' : ''}
            {game.best > 0 ? ` Your best: ${formatGameTime(game.best)}.` : ''} Press an arrow key or swipe to start.
          </span>
        }
      />
    )
  }
  if (status === 'paused' && !isAi) {
    return <BoardOverlay title="Paused" action={<Button onClick={game.togglePause}>Resume</Button>} />
  }
  return null
}

/**
 * [ 1 ] [ 2 ] [🔒] …: which Adventure stage the next run plays. Stage 1 is always open and each clear
 * the server has saved on this device opens the next; locked stages show a lock and cannot be chosen.
 */
function StagePicker({
  stages,
  highestUnlocked,
  selected,
  locked,
  onChange,
}: {
  stages: readonly SnakeAdventureMode[]
  highestUnlocked: number
  /** The stage chosen, or `undefined` while Classic or a map is. */
  selected?: string
  /** While a human run is under way: it keeps its board. */
  locked: boolean
  onChange: (mode: string) => void
}) {
  return (
    <section className="rounded-control bg-surface-muted p-3">
      <h2 className="mb-2 font-display text-base font-semibold">Adventure</h2>
      <div role="group" aria-label="Adventure stage" className="grid grid-cols-6 gap-1">
        {stages.map((option) => {
          const { id } = option.stage
          const closed = id > highestUnlocked
          const pressed = option.mode === selected
          return (
            <button
              key={option.mode}
              type="button"
              aria-pressed={pressed}
              aria-label={`Stage ${id}: ${option.board}, ${objectiveOf(option.stage).toLowerCase().replace(/\.$/, '')}${closed ? ', locked' : ''}`}
              title={closed ? `Clear stage ${id - 1} to open it` : `${option.board}: ${objectiveOf(option.stage)}`}
              disabled={closed || (locked && !pressed)}
              onClick={() => onChange(option.mode)}
              className={cn(
                'grid h-9 place-items-center rounded-xl font-display text-sm font-semibold tabular-nums transition-colors disabled:cursor-not-allowed',
                pressed && 'bg-(--accent) text-(--accent-ink) shadow-soft',
                !pressed && !closed && 'text-ink-soft hover:bg-surface hover:text-ink disabled:opacity-50',
                closed && 'text-ink-soft/50',
              )}
            >
              {closed ? <Lock aria-hidden className="size-3.5" /> : id}
            </button>
          )
        })}
      </div>
      <p className="mt-2 text-xs text-ink-soft">Progress and best times are saved on this device only.</p>
    </section>
  )
}
