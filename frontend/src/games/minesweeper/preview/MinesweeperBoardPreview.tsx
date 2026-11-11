import { useReducer, useState } from 'react'
import { cn } from '@/lib/cn'
import { isLargeBoard } from '../components/boardLayout'
import { BOARDS, createMinesweeper, minesLeft, safeCells, updateMinesweeper, type BoardName } from '../engine/minesweeperEngine'
import { MinesweeperBoard } from '../components/MinesweeperBoard'
import { ToolToggle } from '../components/ToolToggle'
import type { Orientation } from '../components/boardLayout'
import type { Tool } from '../hooks/useMinesweeperGame'

/**
 * The board on its own, at every standard size, for tests and for checking the layout in a browser
 * while only Classic is a mode. Not a game mode and not part of the arcade: nothing imports it but
 * its tests and `dev/minesweeper-board.html` (served by the dev server only, never built), and it has
 * no run: no session is opened and no score is reported. Its game is the engine alone.
 */
export function MinesweeperBoardPreview({
  board = 'expert',
  seed = 20261106,
  orientation,
}: {
  board?: BoardName
  seed?: number
  orientation?: Orientation
}) {
  const [chosen, setChosen] = useState<BoardName>(board)
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col items-center gap-4 p-4">
      <p className="text-sm text-ink-soft">Board preview: not a game mode. Nothing is saved or sent.</p>
      <div role="group" aria-label="Preview board" className="flex gap-2">
        {(Object.keys(BOARDS) as BoardName[]).map((name) => (
          <button
            key={name}
            type="button"
            aria-pressed={chosen === name}
            onClick={() => setChosen(name)}
            className="rounded-full bg-surface-muted px-3 py-1.5 text-sm font-semibold aria-pressed:bg-rose-500 aria-pressed:text-white"
          >
            {name}
          </button>
        ))}
      </div>
      <PreviewGame key={`${chosen}-${seed}`} board={chosen} seed={seed} orientation={orientation} />
    </div>
  )
}

function PreviewGame({ board, seed, orientation }: { board: BoardName; seed: number; orientation?: Orientation }) {
  const [state, dispatch] = useReducer(updateMinesweeper, undefined, () => createMinesweeper(seed, BOARDS[board]))
  const [tool, setTool] = useState<Tool>('reveal')
  const reveal = (index: number) => dispatch({ type: 'REVEAL', index })
  const flag = (index: number) => dispatch({ type: 'FLAG', index })
  return (
    <>
      <output aria-label="Preview status" className="font-display text-sm tabular-nums">
        {state.status} · {state.revealed}/{safeCells(state)} uncovered · {minesLeft(state)} mines left · {state.moves} moves
      </output>
      {/* The same frame as the game's screen (MinesweeperGame.tsx): Classic's at most 30rem wide. */}
      <div className={cn('relative w-full rounded-2xl', !isLargeBoard(state) && 'max-w-[30rem]')}>
        <MinesweeperBoard
          state={state}
          onAct={(index) => (tool === 'flag' ? flag(index) : reveal(index))}
          onReveal={reveal}
          onFlag={flag}
          orientation={orientation}
        />
      </div>
      <ToolToggle tool={tool} onChange={setTool} />
    </>
  )
}
