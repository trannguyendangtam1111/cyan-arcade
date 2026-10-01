import { memo } from 'react'
import { cn } from '@/lib/cn'
import { SIZE } from '../engine/game2048Engine'
import type { Game2048State } from '../types/game2048Types'

/**
 * Background and text colour per tile value, in the game's orange/yellow family. The number is dark
 * on the lighter tiles and white only where the tile is dark enough for white to be readable.
 */
const TILE_COLORS: Record<number, string> = {
  2: 'bg-amber-100 text-amber-900',
  4: 'bg-amber-200 text-amber-900',
  8: 'bg-orange-300 text-orange-950',
  16: 'bg-orange-400 text-orange-950',
  32: 'bg-orange-500 text-orange-950',
  64: 'bg-orange-600 text-white',
  128: 'bg-yellow-400 text-yellow-950',
  256: 'bg-yellow-500 text-yellow-950',
  512: 'bg-amber-500 text-amber-950',
  1024: 'bg-amber-600 text-white',
  2048: 'bg-amber-700 text-white ring-4 ring-yellow-300',
}
const BEYOND_2048 = 'bg-ink text-white ring-4 ring-yellow-300'

/** Font size relative to the board width, so numbers fit their tile at any screen size. */
function fontSize(value: number): string {
  const digits = String(value).length
  if (digits <= 2) return 'text-[9cqw]'
  if (digits === 3) return 'text-[7.5cqw]'
  if (digits === 4) return 'text-[6cqw]'
  return 'text-[4.8cqw]'
}

interface Board2048Props {
  state: Game2048State
  /** How long a tile takes to slide, in milliseconds. */
  slideMs: number
}

/**
 * Renders a 2048 state. Each tile is positioned by a CSS transform and keyed by its tile id, so
 * a tile that keeps its id slides smoothly to its new cell, while spawned and merged tiles (new
 * ids) mount fresh and pop in.
 */
export const Board2048 = memo(function Board2048({ state, slideMs }: Board2048Props) {
  const tiles = state.board
    .map((value, cell) => ({ value, cell, id: state.tileIds[cell] }))
    .filter((tile) => tile.value !== 0)
    // Keep DOM order stable; re-ordering nodes would interrupt their transitions.
    .sort((a, b) => a.id - b.id)

  return (
    <div
      role="img"
      aria-label={`2048 board. Score ${state.score}. Rows: ${describeBoard(state)}`}
      className="@container size-full rounded-card bg-(--accent)/25 p-[2%] shadow-[inset_0_3px_6px_rgb(0_0_0/0.12),inset_0_-2px_0_rgb(255_255_255/0.5)]"
    >
      <div className="relative size-full">
        {state.board.map((_, cell) => (
          <div key={cell} className="absolute top-0 left-0 size-1/4 p-[1.5%]" style={{ transform: translate(cell) }}>
            <div className="size-full rounded-[18%] bg-surface/50 shadow-[inset_0_2px_3px_rgb(0_0_0/0.08)]" />
          </div>
        ))}

        {tiles.map(({ id, value, cell }) => (
          <div
            key={id}
            className="absolute top-0 left-0 size-1/4 p-[1.5%] transition-transform ease-out"
            style={{ transform: translate(cell), transitionDuration: `${slideMs}ms` }}
          >
            <div
              className={cn(
                'grid size-full place-items-center rounded-[18%] font-display font-bold motion-safe:animate-pop-in',
                'shadow-[inset_0_2px_0_rgb(255_255_255/0.35),inset_0_-0.22em_0_rgb(0_0_0/0.16),0_3px_6px_-2px_rgb(22_50_63/0.35)]',
                TILE_COLORS[value] ?? BEYOND_2048,
                fontSize(value),
              )}
            >
              {value}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
})

function translate(cell: number): string {
  return `translate(${(cell % SIZE) * 100}%, ${Math.floor(cell / SIZE) * 100}%)`
}

function describeBoard(state: Game2048State): string {
  const rows: string[] = []
  for (let row = 0; row < SIZE; row++) {
    rows.push(
      state.board
        .slice(row * SIZE, row * SIZE + SIZE)
        .map((value) => value || 'empty')
        .join(' '),
    )
  }
  return rows.join('; ')
}
