import type { CSSProperties } from 'react'
import { cn } from '@/lib/cn'
import type { Tile, TileState } from '../engine/board'
import type { TileTheme } from '../skins'

const STATE_WORDS: Record<TileState, string> = {
  empty: 'empty',
  filled: 'typed',
  hint: 'hint',
  correct: 'correct',
  present: 'in the word, elsewhere',
  absent: 'not in the word',
}

interface BoardProps {
  rows: Tile[][]
  theme: TileTheme
  /** The row that just got its answer turns over; a new `key` plays it again. */
  reveal: { row: number; key: number } | null
  /** The row being typed: it shakes when a word is refused (a new `shakeKey` shakes it again). */
  activeRow: number
  shakeKey: number
  /** A solved row hops once it has turned over. */
  solvedRow: number | null
  /** How long a tile takes to turn over. */
  flipMs: number
  label: string
}

/** The six rows of five tiles. Purely a picture of the rows it is given. */
export function Board({ rows, theme, reveal, activeRow, shakeKey, solvedRow, flipMs, label }: BoardProps) {
  return (
    <div
      role="grid"
      aria-readonly="true"
      aria-label={label}
      className="flex flex-col gap-1.5 rounded-2xl p-2 sm:gap-2"
      style={{ background: theme.backdrop, '--flip-ms': `${flipMs}ms` } as CSSProperties}
    >
      {rows.map((row, rowIndex) => {
        const revealing = reveal?.row === rowIndex
        const word = row.map((tile) => tile.letter).join('')
        return (
          <div
            // Re-mounting replays the animations: a new reveal, a new shake.
            key={`${rowIndex}-${revealing ? reveal.key : 0}-${rowIndex === activeRow ? shakeKey : 0}`}
            role="row"
            aria-label={word ? `Row ${rowIndex + 1}: ${word}` : `Row ${rowIndex + 1}: empty`}
            className={cn('flex justify-center gap-1.5 sm:gap-2', rowIndex === activeRow && shakeKey > 0 && 'motion-safe:animate-shake')}
          >
            {row.map((tile, index) => (
              <div key={index} className={cn(solvedRow === rowIndex && 'wordle-hop')} style={{ '--i': index } as CSSProperties}>
                <TileView tile={tile} theme={theme} turning={revealing} index={index} typing={rowIndex === activeRow} />
              </div>
            ))}
          </div>
        )
      })}
    </div>
  )
}

interface TileViewProps {
  tile: Tile
  theme: TileTheme
  turning: boolean
  index: number
  typing: boolean
}

function TileView({ tile, theme, turning, index, typing }: TileViewProps) {
  const paint = theme.tiles[tile.state]
  const from = theme.tiles.filled
  const style = {
    '--tile-bg': paint.background,
    '--tile-fg': paint.color,
    '--tile-border': paint.border,
    '--tile-glow': paint.glow ?? 'none',
    '--flip-from-bg': from.background,
    '--flip-from-fg': from.color,
    '--flip-from-border': from.border,
    '--i': index,
    borderRadius: theme.radius,
  } as CSSProperties

  return (
    <div
      role="gridcell"
      aria-label={tile.letter ? `${tile.letter}, ${STATE_WORDS[tile.state]}` : 'empty'}
      data-state={tile.state}
      style={style}
      className={cn(
        'wordle-tile grid size-[clamp(2.75rem,13.5vw,3.6rem)] place-items-center border-2 font-display text-[clamp(1.4rem,7vw,2rem)] leading-none font-bold uppercase select-none',
        turning && 'wordle-flip',
        typing && tile.state === 'filled' && 'wordle-pop',
        tile.state === 'hint' && 'border-dashed',
      )}
    >
      {tile.letter}
    </div>
  )
}
