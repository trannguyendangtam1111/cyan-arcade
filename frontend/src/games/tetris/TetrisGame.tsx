import { Button } from '@/components/ui/Button'
import { BoardOverlay } from '@/games/shared/components/BoardOverlay'
import { GameShell, Key } from '@/games/shared/components/GameShell'
import type { GameProps } from '@/games/types'
import { formatScore } from '@/lib/format'
import { NextPieces } from './components/NextPieces'
import { TetrisBoard } from './components/TetrisBoard'
import { TouchControls } from './components/TouchControls'
import { useTetrisGame } from './hooks/useTetrisGame'
import type { TetrisAction } from './types/tetrisTypes'

const ACTION_LABELS: Record<TetrisAction, string> = {
  LEFT: 'LEFT',
  RIGHT: 'RIGHT',
  ROTATE_CW: 'ROTATE',
  ROTATE_CCW: 'ROTATE',
  SOFT_DROP: 'DOWN',
  HARD_DROP: 'DROP',
  TICK: 'WAIT',
}

/** Tetris's screen. All behaviour lives in `useTetrisGame`; this file only lays it out. */
export default function TetrisGame(props: GameProps) {
  const game = useTetrisGame(props)
  const { state, status, isAi } = game

  let overlay = null
  if (status === 'over') {
    overlay = (
      <BoardOverlay
        title={game.newBest ? 'New best!' : 'Game over'}
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
        description="Press Enter or tap Start."
        action={<Button onClick={game.start}>Start</Button>}
      />
    )
  } else if (status === 'paused' && !isAi) {
    overlay = <BoardOverlay title="Paused" action={<Button onClick={game.togglePause}>Resume</Button>} />
  }

  return (
    <GameShell
      mode={game.mode}
      onModeChange={game.changeMode}
      onRestart={game.restart}
      pause={{ paused: game.paused, onToggle: game.togglePause, disabled: !game.canPause }}
      stats={[
        { label: 'Score', value: state.score },
        { label: 'Lines', value: state.lines },
        { label: 'Level', value: state.level },
      ]}
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
            <TetrisBoard state={state} target={game.target?.landing} />
            {game.lineClear && status === 'playing' && (
              // Keyed by the clear so the announcement replays each time, then fades on its own.
              <p
                key={game.lineClear.id}
                aria-hidden
                className="pointer-events-none absolute top-[18%] left-1/2 -translate-x-1/2 rounded-full bg-ink px-4 py-1 font-display text-sm font-semibold whitespace-nowrap text-white opacity-0 shadow-soft motion-safe:animate-toast"
              >
                {game.lineClear.label}
              </p>
            )}
            {overlay}
          </div>
          <NextPieces queue={state.queue} />
        </div>
      }
    />
  )
}
