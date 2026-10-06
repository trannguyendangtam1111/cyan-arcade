import { Button } from '@/components/ui/Button'
import { BoardOverlay } from '@/games/shared/components/BoardOverlay'
import { DirectionPad } from '@/games/shared/components/DirectionPad'
import { GameShell, Key } from '@/games/shared/components/GameShell'
import { useSwipe } from '@/games/shared/useSwipe'
import type { GameProps } from '@/games/types'
import { cn } from '@/lib/cn'
import type { SnakeAI, SnakeStrategy } from './ai/snakeAi'
import { SnakeBoard } from './components/SnakeBoard'
import { useSnakeGame } from './hooks/useSnakeGame'

const STRATEGY_LABELS: Record<SnakeStrategy, string> = {
  shortcut: 'shortcut to the food',
  loop: 'following the safe loop',
  path: 'shortest safe path',
  survive: 'keeping space open',
  trapped: 'no way out',
}

/** Snake's screen. All behaviour lives in `useSnakeGame`; this file only lays it out. */
export default function SnakeGame(props: GameProps<SnakeAI>) {
  const game = useSnakeGame(props)
  const { state, status, isAi } = game
  const swipe = useSwipe(game.steer)

  const playAgain = <Button onClick={game.restart}>Play again</Button>
  let overlay = null
  if (status === 'won') {
    overlay = <BoardOverlay title="Board cleared!" description="The snake filled every single cell." action={playAgain} />
  } else if (status === 'over') {
    overlay = (
      <BoardOverlay
        title={game.newBest ? 'New best!' : 'Game over'}
        description={
          game.newBest
            ? `${state.score} is your highest score yet.`
            : `You scored ${state.score}. Your best is ${game.best}.`
        }
        action={playAgain}
      />
    )
  } else if (status === 'ready') {
    overlay = <BoardOverlay title="Ready?" description="Press an arrow key or swipe to start." />
  } else if (status === 'paused' && !isAi) {
    overlay = <BoardOverlay title="Paused" action={<Button onClick={game.togglePause}>Resume</Button>} />
  }

  return (
    <GameShell
      mode={game.mode}
      onModeChange={game.changeMode}
      aiAvailable={game.aiAvailable}
      onRestart={game.restart}
      pause={{ paused: game.paused, onToggle: game.togglePause, disabled: !game.canPause }}
      stats={
        isAi
          ? [
              { label: 'Score', value: state.score },
              { label: 'Length', value: state.snake.length },
              { label: 'Moves', value: state.steps },
            ]
          : [
              { label: 'Score', value: state.score },
              { label: 'Best', value: Math.max(game.best, state.score) },
              { label: 'Level', value: game.level },
            ]
      }
      ai={{
        status: status === 'over' || status === 'won' ? 'finished' : status === 'paused' ? 'paused' : 'playing',
        action: game.decision?.action,
        detail: game.decision ? STRATEGY_LABELS[game.decision.strategy] : undefined,
        speed: game.speed,
        onSpeedChange: game.setSpeed,
      }}
      humanHelp={
        <p>
          Steer with <Key>←</Key> <Key>↑</Key> <Key>↓</Key> <Key>→</Key> or <Key>W</Key> <Key>A</Key> <Key>S</Key>{' '}
          <Key>D</Key>. Press <Key>P</Key> to pause. Every five apples the snake speeds up a level.
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
          <SnakeBoard state={state} eaten={game.eaten} />
          {overlay}
        </div>
      }
    />
  )
}
