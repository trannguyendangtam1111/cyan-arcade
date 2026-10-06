import { Button } from '@/components/ui/Button'
import { BoardOverlay } from '@/games/shared/components/BoardOverlay'
import { GameShell, Key } from '@/games/shared/components/GameShell'
import type { GameProps } from '@/games/types'
import { formatScore } from '@/lib/format'
import { MinesweeperBoard } from './components/MinesweeperBoard'
import { ToolToggle } from './components/ToolToggle'
import { useMinesweeperGame } from './hooks/useMinesweeperGame'

/** Seconds as `m:ss`, for the game clock. */
function clock(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

/** Minesweeper's screen. All behaviour lives in `useMinesweeperGame`; this file only lays it out. */
export default function MinesweeperGame(props: GameProps) {
  const game = useMinesweeperGame(props)
  const { state } = game

  let overlay = null
  if (state.status === 'won') {
    overlay = (
      <BoardOverlay
        title={game.newBest ? 'New best!' : 'Board cleared!'}
        description={`Every mine avoided in ${clock(game.seconds)}. You scored ${formatScore(game.score)}.`}
        action={<Button onClick={game.restart}>Play again</Button>}
      />
    )
  } else if (state.status === 'lost') {
    overlay = (
      <BoardOverlay
        title="Boom!"
        description={`You hit a mine after uncovering ${state.revealed} safe ${state.revealed === 1 ? 'cell' : 'cells'}. You scored ${formatScore(game.score)}.`}
        action={<Button onClick={game.restart}>Play again</Button>}
      />
    )
  }

  return (
    <GameShell
      onRestart={game.restart}
      stats={[
        { label: 'Mines', value: game.minesLeft },
        { label: 'Time', value: clock(game.seconds) },
        { label: 'Score', value: game.score },
        { label: 'Best', value: Math.max(game.best, game.score) },
      ]}
      humanHelp={
        <div className="flex flex-col gap-2">
          <p>
            Uncover every square without a mine. A number says how many of the eight squares around it hide one.
          </p>
          <p>
            Click to reveal, right click (or <Key>F</Key>) to flag. On a phone, switch between <strong className="text-ink">Reveal</strong>{' '}
            and <strong className="text-ink">Flag</strong> under the board.
          </p>
          <p>Your first square is always safe. Clear the board faster for a bigger score.</p>
        </div>
      }
      board={
        <div className="relative w-full max-w-[30rem] rounded-2xl">
          <MinesweeperBoard state={state} onAct={game.act} onFlag={game.flag} />
          {state.status === 'ready' && (
            <p className="pointer-events-none absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-ink px-4 py-1 font-display text-sm font-semibold whitespace-nowrap text-white shadow-soft">
              Pick any square to start
            </p>
          )}
          {overlay}
        </div>
      }
      touchControls={<ToolToggle tool={game.tool} onChange={game.setTool} />}
    />
  )
}
