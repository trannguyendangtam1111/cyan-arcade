import { memo, type CSSProperties } from 'react'
import { cn } from '@/lib/cn'
import { boxOf, cellLabel, colOf, digitsOf, DIGITS, rowOf, sees } from '../engine/grid'
import { boardStyle, type BoardTheme } from '../skins'

export interface BoardHighlights {
  /** Tint the selected cell's row, column and box. */
  related: boolean
  /** Tint every cell holding the same digit. */
  same: boolean
}

interface BoardProps {
  givens: readonly number[]
  values: readonly number[]
  notes: readonly number[]
  /** Cells a hint revealed: locked like clues. */
  revealed: ReadonlySet<number>
  /** Cells to mark as mistakes (conflicts, or digits the server says are wrong). */
  errors: ReadonlySet<number>
  selected: number | null
  /** The digit to highlight across the board: the selected cell's, or the pad's. */
  digit: number
  highlights: BoardHighlights
  /** Cells a hint or the AI points at. */
  marked?: ReadonlySet<number>
  /** Pencil marks to show struck through (candidates the AI just removed). */
  struck?: ReadonlyMap<number, number>
  /** The cell whose digit just landed, with a key to replay its pop. */
  pop?: { cell: number; key: number } | null
  /** Rows, columns and boxes just completed, as cells to glow. */
  glow?: { cells: ReadonlySet<number>; key: number } | null
  onSelect?: (cell: number) => void
  theme: BoardTheme
  label: string
  /** Hide the digits (a paused game). */
  hidden?: boolean
}

/**
 * The Sudoku grid: the centrepiece. Clues are bold and darker than the player's digits, pencil marks
 * are small in a 3×3 grid, the selected cell is the strongest colour, its row, column and box and
 * every same digit are tinted, and mistakes are red with a bar under the digit. Each cell is a button
 * with a label saying what is in it.
 */
export const Board = memo(function Board({
  givens,
  values,
  notes,
  revealed,
  errors,
  selected,
  digit,
  highlights,
  marked,
  struck,
  pop,
  glow,
  onSelect,
  theme,
  label,
  hidden = false,
}: BoardProps) {
  return (
    <div
      role="grid"
      aria-label={label}
      aria-rowcount={9}
      aria-colcount={9}
      className="sudoku-board grid w-full grid-cols-9"
      style={boardStyle(theme) as CSSProperties}
    >
      {Array.from({ length: 9 }, (_, row) => (
        <div key={row} role="row" className="contents">
          {Array.from({ length: 9 }, (_, col) => {
            const cell = row * 9 + col
            const value = hidden ? 0 : values[cell]
            const cellNotes = hidden || value !== 0 ? 0 : notes[cell]
            const given = !hidden && givens[cell] !== 0
            const isRevealed = !hidden && revealed.has(cell)
            const isSelected = selected === cell
            const related = highlights.related && selected !== null && !isSelected && (sees(cell, selected) || cell === selected)
            const same = highlights.same && digit !== 0 && value === digit && !isSelected
            const error = !hidden && errors.has(cell)
            const kind = given ? 'given' : value !== 0 ? 'entry' : 'empty'
            const describe = [
              `${cellLabel(cell)}: ${value === 0 ? 'empty' : value}`,
              given ? 'clue' : isRevealed ? 'revealed' : null,
              error ? 'mistake' : null,
              cellNotes ? `notes ${digitsOf(cellNotes).join(', ')}` : null,
            ]
              .filter(Boolean)
              .join(', ')
            return (
              <button
                key={cell}
                type="button"
                role="gridcell"
                tabIndex={isSelected || (selected === null && cell === 0) ? 0 : -1}
                aria-selected={isSelected}
                aria-label={describe}
                data-cell={cell}
                data-row={row}
                data-col={col}
                data-box={boxOf(cell)}
                data-kind={kind}
                data-selected={isSelected}
                data-related={related}
                data-same={same}
                data-error={error}
                data-hint={marked?.has(cell) ?? false}
                onClick={() => onSelect?.(cell)}
                disabled={!onSelect}
                className={cn('sudoku-cell disabled:cursor-default', glow?.cells.has(cell) && 'sudoku-glow', isRevealed && 'italic')}
                style={glow?.cells.has(cell) ? { animationDelay: `${(rowOf(cell) + colOf(cell)) * 25}ms` } : undefined}
              >
                {value !== 0 ? (
                  <span key={pop?.cell === cell ? pop.key : 'still'} className={cn(pop?.cell === cell && 'sudoku-pop')}>
                    {value}
                  </span>
                ) : cellNotes ? (
                  <span aria-hidden className="sudoku-notes">
                    {DIGITS.map((note) => (
                      <span key={note} data-same={highlights.same && note === digit && (cellNotes & (1 << note)) !== 0} data-gone={((struck?.get(cell) ?? 0) & (1 << note)) !== 0}>
                        {(cellNotes & (1 << note)) !== 0 || ((struck?.get(cell) ?? 0) & (1 << note)) !== 0 ? note : ''}
                      </span>
                    ))}
                  </span>
                ) : null}
              </button>
            )
          })}
        </div>
      ))}
    </div>
  )
})
