import { Button } from '@/components/ui/Button'
import { BoardOverlay } from '@/games/shared/components/BoardOverlay'
import { GameShell, Key } from '@/games/shared/components/GameShell'
import { useSwipe } from '@/games/shared/useSwipe'
import type { GameProps } from '@/games/types'
import { formatScore } from '@/lib/format'
import { Board2048 } from './components/Board2048'
import { useGame2048 } from './hooks/useGame2048'

/** 2048's screen. All behaviour lives in `useGame2048`; this file only lays it out. */
export default function Game2048(props: GameProps) {
  const game = useGame2048(props)
  const { state, status, isAi } = game
  const swipe = useSwipe(game.play)

  let overlay = null
  if (status === 'over') {
    overlay = (
      <BoardOverlay
        title={game.newBest ? 'New best!' : 'Game over'}
        description={
          game.newBest
            ? `${formatScore(state.score)} is your highest score yet. Best tile: ${game.highestTile}.`
            : `No moves left. You scored ${formatScore(state.score)} with a best tile of ${game.highestTile}.`
        }
        action={<Button onClick={game.restart}>Play again</Button>}
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
  }

  return (
    <GameShell
      mode={game.mode}
      onModeChange={game.changeMode}
      onRestart={game.restart}
      // A turn-based game has nothing to pause for a human; only AI playback can be paused.
      pause={isAi ? { paused: game.paused, onToggle: game.togglePause, disabled: status === 'over' } : undefined}
      stats={
        isAi
          ? [
              { label: 'Score', value: state.score },
              { label: 'Best tile', value: game.highestTile },
              { label: 'Moves', value: state.moves },
            ]
          : [
              { label: 'Score', value: state.score },
              { label: 'Best', value: Math.max(game.best, state.score) },
              { label: 'Best tile', value: game.highestTile },
            ]
      }
      ai={{
        status: status === 'over' ? 'finished' : status === 'paused' ? 'paused' : 'playing',
        action: game.decision?.action,
        detail: game.decision ? `looking ${game.decision.depth + 1} moves ahead` : undefined,
        speed: game.speed,
        onSpeedChange: game.setSpeed,
      }}
      humanHelp={
        <p>
          Slide with <Key>←</Key> <Key>↑</Key> <Key>↓</Key> <Key>→</Key>, <Key>W</Key> <Key>A</Key> <Key>S</Key>{' '}
          <Key>D</Key> or a swipe. Matching tiles merge. Make <strong className="text-ink">2048</strong> to win,
          then keep going if you like.
        </p>
      }
      board={
        <div {...(isAi ? {} : swipe)} className="relative aspect-square w-full max-w-[30rem] touch-none">
          <Board2048 state={state} slideMs={game.slideMs} />
          {state.won && status === 'playing' && (
            <p className="pointer-events-none absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-ink px-4 py-1 font-display text-sm font-semibold whitespace-nowrap text-white shadow-soft motion-safe:animate-pop-in">
              2048 reached!
            </p>
          )}
          {overlay}
        </div>
      }
    />
  )
}
