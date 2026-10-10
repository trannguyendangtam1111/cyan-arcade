import { useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { cn } from '@/lib/cn'
import { displayOrder, fileOf, FILES, isLightSquare, pieceName, rankOf, squareIndex, squareName, type Target } from '../engine/board'
import type { BoardTheme, PieceSet } from '../skins'
import type { BoardPiece, Side } from '../types/chessTypes'
import { PieceGlyph } from './PieceGlyph'

/** Suggested moves are dashed emerald squares, unlike anything a skin draws. */
const HINT = '#059669'
const HINT_FILL = 'rgba(16, 185, 129, 0.28)'

interface ChessBoardProps {
  placement: readonly (BoardPiece | null)[]
  orientation: Side
  selected: string | null
  targets: ReadonlyMap<string, Target>
  lastMove: { from: string; to: string } | null
  /** A suggested move (a hint, or the engine's choice in a review), drawn apart from the last move. */
  hint?: { from: string; to: string } | null
  checkedKing: string | null
  /** Whether squares respond: off while a move is on its way, and once the game is over. */
  interactive: boolean
  onSquare: (square: string) => void
  onEscape: () => void
  theme: BoardTheme
  pieces: PieceSet
}

/**
 * The board: 64 buttons in a grid, drawn from the position the server sent. A tap or a click
 * (Enter or Space with the keyboard) picks a piece up and puts it down; arrow keys move between
 * squares. The legal squares come from the server: dots for moves, rings for captures.
 */
export function ChessBoard({
  placement,
  orientation,
  selected,
  targets,
  lastMove,
  hint = null,
  checkedKing,
  interactive,
  onSquare,
  onEscape,
  theme,
  pieces,
}: ChessBoardProps) {
  const order = useMemo(() => displayOrder(orientation), [orientation])
  const buttons = useRef<(HTMLButtonElement | null)[]>([])
  // The one square in the tab order (a roving tabindex): the selected piece, else where focus last was.
  const [focusIndex, setFocusIndex] = useState(() => order.indexOf(12))
  const tabStop = selected ? order.indexOf(squareIndex(selected)) : focusIndex

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const steps: Record<string, [number, number]> = {
      ArrowUp: [-1, 0],
      ArrowDown: [1, 0],
      ArrowLeft: [0, -1],
      ArrowRight: [0, 1],
    }
    if (event.key === 'Escape') {
      onEscape()
      return
    }
    const step = steps[event.key]
    if (!step) return
    event.preventDefault()
    const current = buttons.current.findIndex((button) => button === document.activeElement)
    const from = current >= 0 ? current : tabStop
    const row = Math.min(7, Math.max(0, Math.floor(from / 8) + step[0]))
    const column = Math.min(7, Math.max(0, (from % 8) + step[1]))
    const next = row * 8 + column
    setFocusIndex(next)
    buttons.current[next]?.focus()
  }

  return (
    <div
      role="grid"
      aria-label={`Chess board, ${orientation === 'WHITE' ? 'White' : 'Black'} at the bottom`}
      onKeyDown={onKeyDown}
      className="chess-board grid aspect-square w-full touch-manipulation grid-cols-8 grid-rows-8 overflow-hidden rounded-xl border-[6px] shadow-soft select-none"
      style={{ borderColor: theme.frame, background: theme.frame }}
    >
      {Array.from({ length: 8 }, (_, row) => (
        <div role="row" key={row} className="contents">
          {order.slice(row * 8, row * 8 + 8).map((square, column) => {
            const index = row * 8 + column
            const name = squareName(square)
            const piece = placement[square]
            const light = isLightSquare(square)
            const target = targets.get(name)
            const isSelected = selected === name
            const isLast = lastMove !== null && (lastMove.from === name || lastMove.to === name)
            const inCheck = checkedKing === name
            const hinted = hint !== null && (hint.from === name || hint.to === name)
            const label = [
              name,
              piece ? pieceName(piece) : 'empty',
              isSelected && 'selected',
              target && (target.capture ? 'capture' : 'legal move'),
              target?.promotion && 'promotion',
              isLast && 'last move',
              hinted && (hint?.from === name ? 'suggested move from here' : 'suggested move to here'),
              inCheck && 'in check',
            ]
              .filter(Boolean)
              .join(', ')
            return (
              <button
                key={name}
                ref={(element) => {
                  buttons.current[index] = element
                }}
                type="button"
                role="gridcell"
                aria-label={label}
                aria-selected={isSelected}
                aria-disabled={!interactive || undefined}
                tabIndex={index === tabStop ? 0 : -1}
                data-square={name}
                data-target={target ? (target.capture ? 'capture' : 'move') : undefined}
                data-last={isLast || undefined}
                data-hint={hinted ? (hint?.from === name ? 'from' : 'to') : undefined}
                data-check={inCheck || undefined}
                onClick={() => {
                  setFocusIndex(index)
                  if (interactive) onSquare(name)
                }}
                className={cn(
                  'relative min-h-0 min-w-0 outline-none focus-visible:z-10 focus-visible:ring-4 focus-visible:ring-brand-400 focus-visible:ring-inset',
                  interactive ? 'cursor-pointer' : 'cursor-default',
                )}
                style={{ background: light ? theme.light : theme.dark }}
              >
                {isLast && <span aria-hidden className="absolute inset-0" style={{ background: theme.lastMove }} />}
                {isSelected && <span aria-hidden className="absolute inset-0" style={{ background: theme.selected }} />}
                {hinted && (
                  <span
                    aria-hidden
                    className="chess-hint absolute inset-0 border-[0.3rem] border-dashed max-sm:border-[0.2rem]"
                    style={{ borderColor: HINT, background: hint?.to === name ? HINT_FILL : 'transparent' }}
                  />
                )}
                {inCheck && (
                  <span
                    aria-hidden
                    className="chess-check absolute inset-0"
                    style={{ background: `radial-gradient(circle, ${theme.check} 0%, ${theme.check} 30%, transparent 72%)` }}
                  />
                )}
                {column === 0 && (
                  <span
                    aria-hidden
                    className="chess-coord absolute top-[4%] left-[6%] font-display leading-none font-bold"
                    style={{ color: light ? theme.lightInk : theme.darkInk }}
                  >
                    {rankOf(square) + 1}
                  </span>
                )}
                {row === 7 && (
                  <span
                    aria-hidden
                    className="chess-coord absolute right-[6%] bottom-[3%] font-display leading-none font-bold"
                    style={{ color: light ? theme.lightInk : theme.darkInk }}
                  >
                    {FILES[fileOf(square)]}
                  </span>
                )}
                {piece && (
                  <PieceGlyph
                    piece={piece}
                    set={pieces}
                    halo={theme.halo}
                    className={cn('chess-piece absolute inset-[5%] size-[90%]', isSelected && 'chess-piece-lifted')}
                  />
                )}
                {target && !target.capture && (
                  <span
                    aria-hidden
                    className="absolute top-1/2 left-1/2 size-[30%] -translate-x-1/2 -translate-y-1/2 rounded-full"
                    style={{ background: theme.target }}
                  />
                )}
                {target?.capture && (
                  <span
                    aria-hidden
                    className="absolute inset-[4%] rounded-full border-[0.35rem] max-sm:border-[0.25rem]"
                    style={{ borderColor: theme.target }}
                  />
                )}
              </button>
            )
          })}
        </div>
      ))}
    </div>
  )
}

