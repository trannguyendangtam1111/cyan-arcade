import { useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react'
import { cn } from '@/lib/cn'
import { displayOrder, fileOf, FILES, isLightSquare, pieceName, rankOf, squareIndex, squareName, type Target } from '../engine/board'
import { annotationColor, type AnnotationColor, type Annotations } from '../hooks/useAnnotations'
import type { BoardTheme, PieceSet } from '../skins'
import type { BoardPiece, Side } from '../types/chessTypes'
import { BoardArrows, type EngineArrow } from './BoardArrows'
import { PieceGlyph } from './PieceGlyph'

/** Suggested moves are dashed emerald squares, unlike anything a skin draws. */
const HINT = '#059669'
const HINT_FILL = 'rgba(16, 185, 129, 0.28)'

/** A premove (planned, not yet played) is violet and dashed: never mistaken for a move made. */
const PREMOVE = '#7048e8'
const PREMOVE_FILL = 'rgba(112, 72, 232, 0.3)'

/** How far a pointer must travel before a press on a piece becomes a drag (CSS pixels). */
const DRAG_START = 6

/** A small mark on a square: the quality of the move that landed there. */
export interface SquareBadge {
  square: string
  symbol: string
  color: string
  /** The symbol's colour on a solid badge; white by default. */
  ink?: string
  label: string
  /** From a quick analysis (Coach Mode), not the game review: drawn dashed. */
  provisional?: boolean
}

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
  /** Pieces that may be dragged (the side to move's, on the player's turn). */
  movable?: (square: string) => boolean
  /** A drag picked a piece up. */
  onDragStart?: (from: string) => void
  /** A dragged piece was let go over another square. */
  onDrop?: (from: string, to: string) => void
  /** The player's drawings, when shown. */
  annotations?: Annotations | null
  /** The engine's suggestions as arrows. */
  engineArrows?: readonly EngineArrow[]
  onArrow?: (from: string, to: string, color: AnnotationColor) => void
  onMark?: (square: string, color: AnnotationColor) => void
  /** A plain click on the board, which clears the drawings. */
  onClearDrawings?: () => void
  /** Touch devices: taps draw (source, then destination) instead of moving pieces. */
  drawMode?: boolean
  badge?: SquareBadge | null
  /** A planned move waiting for the player's turn (games against Stockfish). */
  premove?: { from: string; to: string } | null
  /** A press on the board while it takes no moves (looking back, the game over, not your turn). */
  onInactivePress?: (square: string) => void
}

interface Drag {
  from: string
  pointerId: number
  startX: number
  startY: number
  active: boolean
}

/**
 * The board: 64 buttons in a grid, drawn from the position the server sent. A piece is moved by
 * dragging it, or by a tap or a click on it and then on a marked square (Enter or Space with the
 * keyboard; arrow keys move between squares). The legal squares come from the server: dots for
 * moves, rings for captures. The right mouse button draws arrows (drag) and highlights squares
 * (click); on a touch screen, draw mode does the same with taps. Drawings never move a piece.
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
  movable,
  onDragStart,
  onDrop,
  annotations = null,
  engineArrows = [],
  onArrow,
  onMark,
  onClearDrawings,
  drawMode = false,
  badge = null,
  premove = null,
  onInactivePress,
}: ChessBoardProps) {
  const order = useMemo(() => displayOrder(orientation), [orientation])
  const buttons = useRef<(HTMLButtonElement | null)[]>([])
  const frame = useRef<HTMLDivElement>(null)
  // The one square in the tab order (a roving tabindex): the selected piece, else where focus last was.
  const [focusIndex, setFocusIndex] = useState(() => order.indexOf(12))
  const tabStop = selected ? order.indexOf(squareIndex(selected)) : focusIndex

  const drag = useRef<Drag | null>(null)
  const [dragView, setDragView] = useState<{ from: string; x: number; y: number; over: string | null } | null>(null)
  // A finished drag is followed by a click on the same press: that click must not act again.
  const swallowClick = useRef(false)
  const rightFrom = useRef<string | null>(null)
  const [drawFrom, setDrawFrom] = useState<string | null>(null)

  /** The square under a point of the screen, by the board's geometry, or `null` off the board. */
  const squareAt = (clientX: number, clientY: number): string | null => {
    const element = frame.current
    if (!element) return null
    const box = element.getBoundingClientRect()
    const x = clientX - box.left - element.clientLeft
    const y = clientY - box.top - element.clientTop
    const size = element.clientWidth / 8
    const column = Math.floor(x / size)
    const row = Math.floor(y / size)
    if (column < 0 || column > 7 || row < 0 || row > 7) return null
    return squareName(order[row * 8 + column])
  }

  const pointInBoard = (clientX: number, clientY: number) => {
    const element = frame.current!
    const box = element.getBoundingClientRect()
    return { x: clientX - box.left - element.clientLeft, y: clientY - box.top - element.clientTop }
  }

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    swallowClick.current = false
    const square = (event.target as HTMLElement).closest<HTMLElement>('[data-square]')?.dataset.square
    if (!square) return
    if (event.button === 2) {
      if (onArrow || onMark) rightFrom.current = square
      return
    }
    if (event.button !== 0) return
    if (!drawMode && annotations && (annotations.arrows.length || annotations.marks.length)) onClearDrawings?.()
    if (!drawMode && !interactive) onInactivePress?.(square)
    if (drawMode || !interactive || !onDrop || !movable?.(square)) return
    drag.current = { from: square, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, active: false }
  }

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const current = drag.current
    if (!current || event.pointerId !== current.pointerId) return
    if (!current.active) {
      if (Math.hypot(event.clientX - current.startX, event.clientY - current.startY) < DRAG_START) return
      current.active = true
      try {
        frame.current?.setPointerCapture(event.pointerId)
      } catch {
        // Already captured by the square (touch): the events still reach the board.
      }
      if (selected !== current.from) onDragStart?.(current.from)
    }
    event.preventDefault()
    setDragView({ from: current.from, ...pointInBoard(event.clientX, event.clientY), over: squareAt(event.clientX, event.clientY) })
  }

  const endDrag = () => {
    drag.current = null
    setDragView(null)
  }

  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button === 2 && rightFrom.current) {
      const from = rightFrom.current
      rightFrom.current = null
      const to = squareAt(event.clientX, event.clientY)
      if (!to) return
      if (to === from) onMark?.(to, annotationColor('mark', event))
      else onArrow?.(from, to, annotationColor('arrow', event))
      return
    }
    const current = drag.current
    if (!current || event.pointerId !== current.pointerId) return
    if (current.active) {
      swallowClick.current = true
      const to = squareAt(event.clientX, event.clientY)
      endDrag()
      if (to && to !== current.from) onDrop?.(current.from, to)
      return
    }
    // No drag: the click that follows does the work.
    drag.current = null
  }

  const onSquareClick = (name: string, index: number) => {
    setFocusIndex(index)
    if (swallowClick.current) {
      swallowClick.current = false
      return
    }
    if (drawMode) {
      if (!drawFrom) setDrawFrom(name)
      else {
        if (drawFrom === name) onMark?.(name, 'red')
        else onArrow?.(drawFrom, name, 'orange')
        setDrawFrom(null)
      }
      return
    }
    if (interactive) onSquare(name)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const steps: Record<string, [number, number]> = {
      ArrowUp: [-1, 0],
      ArrowDown: [1, 0],
      ArrowLeft: [0, -1],
      ArrowRight: [0, 1],
    }
    if (event.key === 'Escape') {
      setDrawFrom(null)
      endDrag()
      onEscape()
      return
    }
    const step = steps[event.key]
    if (!step) return
    // The squares take the arrow keys; the move list and the board's frame step through the game.
    event.preventDefault()
    event.stopPropagation()
    const current = buttons.current.findIndex((button) => button === document.activeElement)
    const from = current >= 0 ? current : tabStop
    const row = Math.min(7, Math.max(0, Math.floor(from / 8) + step[0]))
    const column = Math.min(7, Math.max(0, (from % 8) + step[1]))
    const next = row * 8 + column
    setFocusIndex(next)
    buttons.current[next]?.focus()
  }

  const draggingFrom = dragView?.from ?? null
  const dragged = draggingFrom ? placement[squareIndex(draggingFrom)] : null
  const shownDrawings = annotations ?? { arrows: [], marks: [] }

  return (
    <div
      ref={frame}
      role="grid"
      aria-label={`Chess board, ${orientation === 'WHITE' ? 'White' : 'Black'} at the bottom${drawMode ? ', draw mode' : ''}`}
      onKeyDown={onKeyDown}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={endDrag}
      onContextMenu={(event) => event.preventDefault()}
      data-dragging={draggingFrom ?? undefined}
      className="chess-board relative grid aspect-square w-full grid-cols-8 grid-rows-8 overflow-hidden rounded-xl border-[6px] shadow-soft select-none"
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
            const planned = premove !== null && (premove.from === name || premove.to === name)
            const canDrag = !drawMode && interactive && onDrop !== undefined && (movable?.(name) ?? false)
            const over = dragView?.over === name && name !== draggingFrom
            const label = [
              name,
              piece ? pieceName(piece) : 'empty',
              isSelected && 'selected',
              target && (target.capture ? 'capture' : 'legal move'),
              target?.promotion && 'promotion',
              isLast && 'last move',
              hinted && (hint?.from === name ? 'suggested move from here' : 'suggested move to here'),
              planned && (premove?.from === name ? 'premove from here' : 'premove to here'),
              inCheck && 'in check',
              badge?.square === name && badge.label,
            ]
              .filter(Boolean)
              .join(', ')
            const style: CSSProperties = { background: light ? theme.light : theme.dark, touchAction: canDrag ? 'none' : 'manipulation' }
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
                aria-disabled={(!interactive && !drawMode) || undefined}
                tabIndex={index === tabStop ? 0 : -1}
                data-square={name}
                data-target={target ? (target.capture ? 'capture' : 'move') : undefined}
                data-last={isLast || undefined}
                data-hint={hinted ? (hint?.from === name ? 'from' : 'to') : undefined}
                data-check={inCheck || undefined}
                data-premove={planned ? (premove?.from === name ? 'from' : 'to') : undefined}
                data-draw-from={drawFrom === name || undefined}
                onClick={() => onSquareClick(name, index)}
                className={cn(
                  'relative min-h-0 min-w-0 outline-none focus-visible:z-10 focus-visible:ring-4 focus-visible:ring-brand-400 focus-visible:ring-inset',
                  canDrag ? 'cursor-grab' : interactive || drawMode ? 'cursor-pointer' : 'cursor-default',
                )}
                style={style}
              >
                {isLast && <span aria-hidden className="absolute inset-0" style={{ background: theme.lastMove }} />}
                {isSelected && <span aria-hidden className="absolute inset-0" style={{ background: theme.selected }} />}
                {over && <span aria-hidden className="absolute inset-0 ring-4 ring-white/80 ring-inset" />}
                {hinted && (
                  <span
                    aria-hidden
                    className="chess-hint absolute inset-0 border-[0.3rem] border-dashed max-sm:border-[0.2rem]"
                    style={{ borderColor: HINT, background: hint?.to === name ? HINT_FILL : 'transparent' }}
                  />
                )}
                {planned && (
                  <span
                    aria-hidden
                    className="absolute inset-0 border-[0.3rem] border-dashed max-sm:border-[0.2rem]"
                    style={{ borderColor: PREMOVE, background: PREMOVE_FILL }}
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
                    className={cn('chess-piece absolute inset-[5%] size-[90%]', isSelected && !draggingFrom && 'chess-piece-lifted', draggingFrom === name && 'opacity-35')}
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
                {badge?.square === name && (
                  <span
                    aria-hidden
                    data-badge={badge.symbol}
                    data-provisional={badge.provisional || undefined}
                    className={cn(
                      'chess-badge absolute top-[2%] right-[2%] z-10 grid place-items-center rounded-full font-display leading-none font-bold shadow',
                      badge.provisional ? 'border-2 border-dashed bg-white' : 'text-white',
                    )}
                    style={badge.provisional ? { color: badge.color, borderColor: badge.color } : { background: badge.color, color: badge.ink }}
                  >
                    {badge.symbol}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      ))}
      <BoardArrows orientation={orientation} arrows={shownDrawings.arrows} marks={shownDrawings.marks} engine={engineArrows} pending={drawFrom} />
      {dragView && dragged && (
        <span
          aria-hidden
          className="chess-drag pointer-events-none absolute z-30"
          style={{ left: dragView.x, top: dragView.y, width: '12.5%', height: '12.5%' }}
        >
          <PieceGlyph piece={dragged} set={pieces} halo={theme.halo} className="size-full" />
        </span>
      )}
    </div>
  )
}
