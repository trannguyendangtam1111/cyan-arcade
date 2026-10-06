import { Bomb, Flag } from 'lucide-react'
import type { KeyboardEvent, MouseEvent } from 'react'
import { cn } from '@/lib/cn'
import type { Cell, MinesweeperState } from '../types/minesweeperTypes'

/** The classic colour per number, each dark enough to read on a light cell. */
const NUMBER_COLORS: Record<number, string> = {
  1: 'text-blue-700',
  2: 'text-green-700',
  3: 'text-red-700',
  4: 'text-violet-800',
  5: 'text-rose-900',
  6: 'text-teal-800',
  7: 'text-slate-900',
  8: 'text-slate-600',
}

interface MinesweeperBoardProps {
  state: MinesweeperState
  /** A tap, a left click or Enter on a cell. */
  onAct: (index: number) => void
  /** A right click or F on a cell: always a flag. */
  onFlag: (index: number) => void
}

/** What a screen reader hears for a cell. */
function describe(cell: Cell, row: number, column: number, over: boolean): string {
  const where = `Row ${row + 1}, column ${column + 1}`
  if (cell.revealed && cell.mine) return `${where}: mine`
  if (cell.revealed) return `${where}: ${cell.adjacent === 0 ? 'empty' : `${cell.adjacent} nearby`}`
  if (over && cell.mine) return `${where}: mine`
  if (cell.flagged) return `${where}: flagged`
  return `${where}: hidden`
}

/**
 * The minefield: one button per cell, so it works with a mouse, a finger and a keyboard alike.
 * Once the game is over, every mine is shown.
 */
export function MinesweeperBoard({ state, onAct, onFlag }: MinesweeperBoardProps) {
  const over = state.status === 'won' || state.status === 'lost'

  const contextMenu = (index: number) => (event: MouseEvent) => {
    event.preventDefault()
    onFlag(index)
  }
  const keyDown = (index: number) => (event: KeyboardEvent) => {
    if (event.key === 'f' || event.key === 'F') {
      event.preventDefault()
      onFlag(index)
    }
  }

  return (
    <div
      role="grid"
      aria-label="Minefield"
      className="grid w-full gap-1 rounded-2xl bg-rose-100 p-2 shadow-soft ring-4 ring-rose-200 sm:gap-1.5 sm:p-3"
      style={{ gridTemplateColumns: `repeat(${state.columns}, minmax(0, 1fr))` }}
    >
      {state.cells.map((cell, index) => {
        const row = Math.floor(index / state.columns)
        const column = index % state.columns
        const showMine = cell.mine && (cell.revealed || over)
        return (
          <button
            key={index}
            type="button"
            role="gridcell"
            aria-label={describe(cell, row, column, over)}
            onClick={() => onAct(index)}
            onContextMenu={contextMenu(index)}
            onKeyDown={keyDown(index)}
            disabled={over || (cell.revealed && !cell.mine)}
            className={cn(
              'grid aspect-square place-items-center rounded-lg font-display text-[min(5.5vw,1.6rem)] leading-none font-bold transition-[transform,background-color] select-none',
              'focus-visible:outline-4 focus-visible:outline-offset-1 focus-visible:outline-brand-500',
              cell.revealed
                ? 'bg-white shadow-inner'
                : 'bg-linear-to-b from-rose-400 to-rose-500 text-white shadow-[0_3px_0_0_var(--color-rose-700)] enabled:hover:-translate-y-0.5 enabled:active:translate-y-0.5 enabled:active:shadow-none',
              index === state.exploded && 'bg-red-500 text-white ring-4 ring-red-300',
              showMine && !cell.revealed && 'bg-rose-200 bg-none text-slate-900 shadow-none',
              cell.revealed && !cell.mine && NUMBER_COLORS[cell.adjacent],
            )}
          >
            {showMine ? (
              <Bomb aria-hidden className="size-[60%]" strokeWidth={2.5} />
            ) : cell.flagged ? (
              <Flag aria-hidden className="size-[55%]" fill="currentColor" strokeWidth={2.5} />
            ) : cell.revealed && cell.adjacent > 0 ? (
              cell.adjacent
            ) : null}
          </button>
        )
      })}
    </div>
  )
}
