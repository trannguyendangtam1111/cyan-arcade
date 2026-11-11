/**
 * How the minefield is laid out on screen: which way round it is drawn, how big its cells are, and
 * where the keyboard moves next. Pure functions of the board's shape and the space it has, so the
 * board component stays a picture of them. The engine never sees any of this: its board is always
 * `rows × columns`, cell `r × columns + c`.
 */

/** A board's shape: the engine's, or as drawn. */
export interface BoardShape {
  rows: number
  columns: number
}

/**
 * `landscape` draws the engine's board as it is. `portrait` draws it turned on its diagonal
 * (transposed): engine row `r`, column `c` is drawn at row `c`, column `r`, so a 16-row × 30-column
 * Expert board stands 30 rows tall and 16 columns wide, and the top-left cell stays top-left. A
 * transposition keeps every cell's neighbours its neighbours, so flood reveals look the same.
 */
export type Orientation = 'landscape' | 'portrait'

/** `fit` sizes the cells so the whole board fits its width; `zoom` gives them a fixed, comfortable size and pans. */
export type BoardView = 'fit' | 'zoom'

/** Gap and inner padding of a large board, in pixels (Tailwind `gap-0.5` and `p-1.5`). */
export const LARGE_GAP_PX = 2
export const LARGE_PADDING_PX = 6

/** Below this, a fitted cell is too small to tap reliably, so a large board opens zoomed. */
export const MIN_FIT_CELL_PX = 24
/** A fitted cell grows no bigger than this, so an Intermediate board does not sprawl on a wide screen. */
export const MAX_FIT_CELL_PX = 44
/** A zoomed cell: a comfortable target for a finger. */
export const ZOOM_CELL_PX = 36
/** Narrower than this, a board wider than it is tall is drawn in portrait. */
export const PORTRAIT_BELOW_PX = 640

/** Classic's 9 × 9 keeps the layout it always had; anything bigger gets the large-board layout. */
export function isLargeBoard(board: BoardShape): boolean {
  return board.rows > 9 || board.columns > 9
}

/** The board as drawn. */
export function visualShape(board: BoardShape, orientation: Orientation): BoardShape {
  return orientation === 'portrait' ? { rows: board.columns, columns: board.rows } : { rows: board.rows, columns: board.columns }
}

/** The engine cell drawn at this row and column. */
export function engineIndex(board: BoardShape, orientation: Orientation, row: number, column: number): number {
  return orientation === 'portrait' ? column * board.columns + row : row * board.columns + column
}

/** Where an engine cell is drawn. */
export function visualPosition(board: BoardShape, orientation: Orientation, index: number): { row: number; column: number } {
  const row = Math.floor(index / board.columns)
  const column = index % board.columns
  return orientation === 'portrait' ? { row: column, column: row } : { row, column }
}

/**
 * The orientation for a board in this much width: portrait for a board wider than it is tall on a
 * narrow screen (Expert on a phone), landscape otherwise, and while the width is not known yet.
 */
export function orientationFor(board: BoardShape, width: number | null): Orientation {
  return board.columns > board.rows && width !== null && width < PORTRAIT_BELOW_PX ? 'portrait' : 'landscape'
}

/** The size of a fitted cell of a large board drawn this many columns wide in this much width. */
export function fitCellPx(width: number, columns: number): number {
  return (width - 2 * LARGE_PADDING_PX - (columns - 1) * LARGE_GAP_PX) / columns
}

/** The widest a large board is drawn: `columns` cells of `cellPx`, with its gaps and padding. */
export function boardWidthPx(columns: number, cellPx: number): number {
  return columns * cellPx + (columns - 1) * LARGE_GAP_PX + 2 * LARGE_PADDING_PX
}

/**
 * The view a large board opens in: fitted when its cells would be big enough to tap, zoomed
 * otherwise, and fitted while the width is not known yet.
 * @param columns the board's columns as drawn
 */
export function defaultView(columns: number, width: number | null): BoardView {
  return width !== null && fitCellPx(width, columns) < MIN_FIT_CELL_PX ? 'zoom' : 'fit'
}

/**
 * Where the arrow keys (and Home and End) move the keyboard's cell on the board as drawn: one cell
 * at a time, stopping at the edges; Home and End go to the start and end of the row, and with Ctrl
 * to the first and last cell. Any other key moves nothing: `null`.
 */
export function moveFrom(
  shape: BoardShape,
  at: { row: number; column: number },
  key: string,
  ctrl = false,
): { row: number; column: number } | null {
  const last = { row: shape.rows - 1, column: shape.columns - 1 }
  switch (key) {
    case 'ArrowUp':
      return { row: Math.max(0, at.row - 1), column: at.column }
    case 'ArrowDown':
      return { row: Math.min(last.row, at.row + 1), column: at.column }
    case 'ArrowLeft':
      return { row: at.row, column: Math.max(0, at.column - 1) }
    case 'ArrowRight':
      return { row: at.row, column: Math.min(last.column, at.column + 1) }
    case 'Home':
      return ctrl ? { row: 0, column: 0 } : { row: at.row, column: 0 }
    case 'End':
      return ctrl ? last : { row: at.row, column: last.column }
    default:
      return null
  }
}
