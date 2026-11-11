import { Bomb, Flag, Shrink, ZoomIn } from 'lucide-react'
import { memo, useRef, useState } from 'react'
import type { CSSProperties, KeyboardEvent, MouseEvent, PointerEvent } from 'react'
import { cn } from '@/lib/cn'
import { useElementWidth } from '../hooks/useElementWidth'
import type { Cell, MinesweeperState } from '../types/minesweeperTypes'
import {
  LARGE_GAP_PX,
  LARGE_PADDING_PX,
  MAX_FIT_CELL_PX,
  ZOOM_CELL_PX,
  boardWidthPx,
  defaultView,
  engineIndex,
  isLargeBoard,
  moveFrom,
  orientationFor,
  visualPosition,
  visualShape,
  type BoardView,
  type Orientation,
} from './boardLayout'
import { cellLabel } from './cellLabel'

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

/** A press that moves this far before it lifts is a pan, not a tap. */
const PAN_SLOP_PX = 10

interface MinesweeperBoardProps {
  state: MinesweeperState
  /** A tap or a left click on a cell: whatever the Reveal/Flag tool says. */
  onAct: (index: number) => void
  /** Enter or Space on the keyboard's cell: always a reveal. */
  onReveal: (index: number) => void
  /** A right click or F on a cell: always a flag. */
  onFlag: (index: number) => void
  /** For previews and tests: draw the board this way round instead of the way its width picks. */
  orientation?: Orientation
}

interface CellButtonProps {
  cell: Cell
  /** The engine's index of the cell, whatever its place on screen. */
  index: number
  /** Where it is drawn. */
  row: number
  column: number
  over: boolean
  exploded: boolean
  /** The keyboard's cell: the board's one Tab stop. */
  tabbable: boolean
  large: boolean
}

/**
 * One cell. Memoised: a reveal or a flag replaces only the cells it changes, so only those draw
 * again, however big the board. Its events are the board's (one listener for every cell).
 */
const CellButton = memo(function CellButton({ cell, index, row, column, over, exploded, tabbable, large }: CellButtonProps) {
  const showMine = cell.mine && (cell.revealed || over)
  return (
    <button
      type="button"
      role="gridcell"
      data-index={index}
      aria-label={cellLabel(cell, row, column, over)}
      tabIndex={tabbable ? 0 : -1}
      disabled={over}
      // Uncovered, it does nothing more, but the keyboard can still pass over it.
      aria-disabled={!over && cell.revealed && !cell.mine ? true : undefined}
      className={cn(
        'grid aspect-square place-items-center font-display leading-none font-bold transition-[transform,background-color] select-none',
        large
          ? 'relative min-w-0 rounded-md focus-visible:z-10 focus-visible:outline-3 focus-visible:outline-offset-0'
          : 'rounded-lg text-[min(5.5vw,1.6rem)] focus-visible:outline-4 focus-visible:outline-offset-1',
        'focus-visible:outline-brand-500',
        cell.revealed
          ? 'bg-white shadow-inner'
          : cn(
              'bg-linear-to-b from-rose-400 to-rose-500 text-white enabled:hover:-translate-y-0.5 enabled:active:translate-y-0.5 enabled:active:shadow-none',
              large ? 'shadow-[0_2px_0_0_var(--color-rose-700)]' : 'shadow-[0_3px_0_0_var(--color-rose-700)]',
            ),
        exploded && cn('bg-red-500 text-white', large ? 'ring-2 ring-red-300' : 'ring-4 ring-red-300'),
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
})

const VIEWS: { view: BoardView; label: string; icon: typeof Shrink }[] = [
  { view: 'fit', label: 'Fit', icon: Shrink },
  { view: 'zoom', label: 'Zoom', icon: ZoomIn },
]

/** Fit or Zoom, for a board too big to show comfortably at once. */
function ViewToggle({ view, onChange }: { view: BoardView; onChange: (view: BoardView) => void }) {
  return (
    <div role="group" aria-label="Board view" className="inline-flex gap-1 rounded-full bg-surface-muted p-1">
      {VIEWS.map(({ view: option, label, icon: Icon }) => (
        <button
          key={option}
          type="button"
          aria-pressed={view === option}
          onClick={() => onChange(option)}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 font-display text-sm font-semibold transition-all active:scale-95',
            view === option ? 'bg-rose-500 text-white shadow-[0_2px_0_0_var(--color-rose-700)]' : 'text-ink-soft hover:text-ink',
          )}
        >
          <Icon aria-hidden className="size-4" />
          {label}
        </button>
      ))}
    </div>
  )
}

/**
 * The minefield: one button per cell, so it works with a mouse, a finger and a keyboard alike.
 * Once the game is over, every mine is shown.
 *
 * Classic's 9 × 9 board keeps the layout it always had. A larger board is fitted to its width or,
 * when its cells would be too small to tap, zoomed to a fixed cell size and panned inside its own
 * frame (the page never scrolls sideways); Fit and Zoom switch between the two. On a narrow screen a
 * board wider than it is tall (Expert) is drawn in portrait, turned on its diagonal; every cell drawn
 * still names its engine cell, so a reveal, a flag and a flood land where they belong.
 *
 * The keyboard has one Tab stop: the arrow keys (and Home, End) move it over the board as drawn,
 * Enter or Space reveals and F flags. A press that pans the board before it lifts does nothing.
 */
export function MinesweeperBoard({ state, onAct, onReveal, onFlag, orientation: forced }: MinesweeperBoardProps) {
  const over = state.status === 'won' || state.status === 'lost'
  const large = isLargeBoard(state)
  // Only a large board's layout depends on its width; Classic's frame is not measured.
  const { ref: frame, width } = useElementWidth<HTMLDivElement>(large)
  const orientation = forced ?? (large ? orientationFor(state, width) : 'landscape')
  const shape = visualShape(state, orientation)
  const [chosenView, setChosenView] = useState<BoardView | null>(null)
  const view: BoardView = large ? (chosenView ?? defaultView(shape.columns, width)) : 'fit'
  const [cursor, setCursor] = useState(0)
  const keyboardCell = cursor < state.cells.length ? cursor : 0
  const grid = useRef<HTMLDivElement>(null)
  /** The press in progress, and whether it has moved (or the board has scrolled) since it began. */
  const press = useRef<{ x: number; y: number; moved: boolean } | null>(null)

  const cellOf = (target: EventTarget) => {
    const element = (target as HTMLElement).closest?.('[data-index]')
    return element ? Number(element.getAttribute('data-index')) : null
  }
  /** Ends the press: whether it panned rather than tapped. */
  const panned = () => {
    const moved = press.current?.moved ?? false
    press.current = null
    return moved
  }

  const pointerDown = (event: PointerEvent) => {
    press.current = { x: event.clientX, y: event.clientY, moved: false }
  }
  const pointerMove = (event: PointerEvent) => {
    const current = press.current
    // A finger or a pen that slides is panning. A mouse pans with the wheel or the scroll bar
    // (caught by `scrolled`), so a click that wobbles still counts, as it always has.
    if (event.pointerType === 'mouse') return
    if (current && !current.moved && Math.hypot(event.clientX - current.x, event.clientY - current.y) > PAN_SLOP_PX) {
      current.moved = true
    }
  }
  const pointerCancel = () => {
    if (press.current) press.current.moved = true
  }
  const scrolled = () => {
    if (press.current) press.current.moved = true
  }

  const click = (event: MouseEvent) => {
    const index = cellOf(event.target)
    if (panned() || index === null) return
    onAct(index)
  }
  const contextMenu = (event: MouseEvent) => {
    event.preventDefault()
    const index = cellOf(event.target)
    if (panned() || index === null) return
    onFlag(index)
  }
  const keyDown = (event: KeyboardEvent) => {
    const index = cellOf(event.target)
    if (index === null) return
    if (event.key === 'f' || event.key === 'F') {
      event.preventDefault()
      onFlag(index)
      return
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      onReveal(index)
      return
    }
    const next = moveFrom(shape, visualPosition(state, orientation, index), event.key, event.ctrlKey || event.metaKey)
    if (!next) return
    event.preventDefault()
    const target = engineIndex(state, orientation, next.row, next.column)
    setCursor(target)
    grid.current?.querySelector<HTMLElement>(`[data-index="${target}"]`)?.focus()
  }
  const focus = (event: { target: EventTarget }) => {
    const index = cellOf(event.target)
    if (index !== null) setCursor(index)
  }

  const rows = Array.from({ length: shape.rows }, (_, row) => (
    <div key={row} role="row" className="contents">
      {Array.from({ length: shape.columns }, (_, column) => {
        const index = engineIndex(state, orientation, row, column)
        return (
          <CellButton
            key={index}
            cell={state.cells[index]}
            index={index}
            row={row}
            column={column}
            over={over}
            exploded={index === state.exploded}
            tabbable={index === keyboardCell}
            large={large}
          />
        )
      })}
    </div>
  ))

  const gridProps = {
    ref: grid,
    role: 'grid',
    'aria-label': 'Minefield',
    'aria-rowcount': shape.rows,
    'aria-colcount': shape.columns,
    'data-orientation': orientation,
    onClick: click,
    onContextMenu: contextMenu,
    onKeyDown: keyDown,
    onFocus: focus,
    onPointerDown: pointerDown,
    onPointerMove: pointerMove,
    onPointerCancel: pointerCancel,
  }

  if (!large) {
    return (
      <div
        {...gridProps}
        className="grid w-full gap-1 rounded-2xl bg-rose-100 p-2 shadow-soft ring-4 ring-rose-200 sm:gap-1.5 sm:p-3"
        style={{ gridTemplateColumns: `repeat(${shape.columns}, minmax(0, 1fr))` }}
      >
        {rows}
      </div>
    )
  }

  const chrome = 2 * LARGE_PADDING_PX + (shape.columns - 1) * LARGE_GAP_PX
  const zoomed = view === 'zoom'
  const gridStyle = {
    // The cell's size drives its number, mine and flag: fitted, a share of the frame's width.
    '--cell': zoomed ? `${ZOOM_CELL_PX}px` : `calc((100cqw - ${chrome}px) / ${shape.columns})`,
    fontSize: 'calc(var(--cell) * 0.6)',
    gridTemplateColumns: zoomed ? `repeat(${shape.columns}, var(--cell))` : `repeat(${shape.columns}, minmax(0, 1fr))`,
    ...(zoomed && { width: boardWidthPx(shape.columns, ZOOM_CELL_PX) }),
  } as CSSProperties

  return (
    <div ref={frame} className="flex w-full flex-col items-center gap-3">
      <div
        data-testid="minefield-viewport"
        data-view={view}
        onScroll={scrolled}
        className={cn(
          'w-full rounded-2xl bg-rose-100 shadow-soft ring-4 ring-rose-200 @container',
          zoomed && 'max-h-[70svh] overflow-auto overscroll-contain',
        )}
        style={{ maxWidth: boardWidthPx(shape.columns, zoomed ? ZOOM_CELL_PX : MAX_FIT_CELL_PX) }}
      >
        <div {...gridProps} className={cn('grid touch-manipulation gap-0.5 p-1.5', !zoomed && 'w-full')} style={gridStyle}>
          {rows}
        </div>
      </div>
      <ViewToggle view={view} onChange={setChosenView} />
    </div>
  )
}
