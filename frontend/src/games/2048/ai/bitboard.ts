import { SIZE, type Board, type Move } from '../engine/game2048Engine'

/**
 * A compact board for the AI's search.
 *
 * The engine's board is easy to read but too slow to copy hundreds of thousands of times per move.
 * Here each tile is stored as its exponent (0 = empty, 1 = "2", 2 = "4", ... 15 = "32768") in
 * 4 bits, so a row fits in a 16-bit number and there are only 65,536 possible rows. Sliding a row
 * and scoring a row are both precomputed for every possible row, which turns a move or an
 * evaluation of the whole board into a handful of table lookups.
 *
 * Column `c` of a row lives in bits `4c .. 4c+3`.
 */
export type Rows = readonly [number, number, number, number]

const ROW_COUNT = 1 << 16
const MAX_EXPONENT = 15

/** Evaluation weights, from the well-known expectimax 2048 solver by Robert Xiao (nneonneo). */
const LOST_PENALTY = 200_000
const EMPTY_WEIGHT = 270
const MERGES_WEIGHT = 700
const MONOTONICITY_WEIGHT = 47
const MONOTONICITY_POWER = 4
const SUM_WEIGHT = 11
const SUM_POWER = 3.5

const slideLeftTable = new Uint16Array(ROW_COUNT)
const slideRightTable = new Uint16Array(ROW_COUNT)
const rowScoreTable = new Float64Array(ROW_COUNT)
let tablesReady = false

function unpack(row: number): number[] {
  return [row & 15, (row >> 4) & 15, (row >> 8) & 15, (row >> 12) & 15]
}

function pack(cells: number[]): number {
  return cells[0] | (cells[1] << 4) | (cells[2] << 8) | (cells[3] << 12)
}

/** Slides one row of exponents towards index 0, merging equal neighbours once. */
function slideCells(cells: number[]): number[] {
  const result: number[] = []
  let canMerge = false
  for (const exponent of cells) {
    if (exponent === 0) continue
    if (canMerge && result[result.length - 1] === exponent) {
      result[result.length - 1] = Math.min(exponent + 1, MAX_EXPONENT)
      canMerge = false
    } else {
      result.push(exponent)
      canMerge = true
    }
  }
  while (result.length < SIZE) result.push(0)
  return result
}

/**
 * How good one row (or column) looks on its own. Higher is better.
 *
 *  + empty cells: room to manoeuvre
 *  + merge opportunities: equal tiles next to each other
 *  - broken monotonicity: tiles should be ordered along the line, which keeps big tiles together
 *    at one edge (and so in a corner, once rows and columns are both counted)
 *  - total tile weight: fewer, larger tiles are better than many medium ones
 */
function scoreCells(cells: number[]): number {
  let sum = 0
  let empty = 0
  let merges = 0
  let previous = 0
  let run = 0

  for (const exponent of cells) {
    sum += Math.pow(exponent, SUM_POWER)
    if (exponent === 0) {
      empty++
    } else {
      if (previous === exponent) {
        run++
      } else if (run > 0) {
        merges += 1 + run
        run = 0
      }
      previous = exponent
    }
  }
  if (run > 0) merges += 1 + run

  let decreasing = 0
  let increasing = 0
  for (let i = 1; i < SIZE; i++) {
    const a = Math.pow(cells[i - 1], MONOTONICITY_POWER)
    const b = Math.pow(cells[i], MONOTONICITY_POWER)
    if (cells[i - 1] > cells[i]) decreasing += a - b
    else increasing += b - a
  }

  return (
    LOST_PENALTY +
    EMPTY_WEIGHT * empty +
    MERGES_WEIGHT * merges -
    MONOTONICITY_WEIGHT * Math.min(decreasing, increasing) -
    SUM_WEIGHT * sum
  )
}

/** Fills the lookup tables on first use (a few milliseconds, once per page). */
export function ensureTables(): void {
  if (tablesReady) return
  for (let row = 0; row < ROW_COUNT; row++) {
    const cells = unpack(row)
    slideLeftTable[row] = pack(slideCells(cells))
    slideRightTable[row] = pack(slideCells([...cells].reverse()).reverse())
    rowScoreTable[row] = scoreCells(cells)
  }
  tablesReady = true
}

export function toRows(board: Board): Rows {
  const row = (r: number) =>
    pack([0, 1, 2, 3].map((c) => Math.min(exponentOf(board[r * SIZE + c]), MAX_EXPONENT)))
  return [row(0), row(1), row(2), row(3)]
}

function exponentOf(value: number): number {
  return value === 0 ? 0 : Math.round(Math.log2(value))
}

export function fromRows(rows: Rows): number[] {
  return rows.flatMap((row) => unpack(row).map((exponent) => (exponent === 0 ? 0 : 2 ** exponent)))
}

/** Swaps rows and columns, so a vertical move can reuse the horizontal tables. */
export function transpose(rows: Rows): Rows {
  const [a, b, c, d] = rows
  const column = (shift: number) =>
    ((a >> shift) & 15) | (((b >> shift) & 15) << 4) | (((c >> shift) & 15) << 8) | (((d >> shift) & 15) << 12)
  return [column(0), column(4), column(8), column(12)]
}

/** The board after sliding (no tile spawn). Returns the same `rows` object when nothing moves. */
export function slideRows(rows: Rows, move: Move): Rows {
  let next: Rows
  switch (move) {
    case 'LEFT':
      next = mapRows(rows, slideLeftTable)
      break
    case 'RIGHT':
      next = mapRows(rows, slideRightTable)
      break
    case 'UP':
      next = transpose(mapRows(transpose(rows), slideLeftTable))
      break
    case 'DOWN':
      next = transpose(mapRows(transpose(rows), slideRightTable))
      break
  }
  return sameRows(rows, next) ? rows : next
}

function mapRows(rows: Rows, table: Uint16Array): Rows {
  return [table[rows[0]], table[rows[1]], table[rows[2]], table[rows[3]]]
}

function sameRows(a: Rows, b: Rows): boolean {
  return a[0] === b[0] && a[1] === b[1] && a[2] === b[2] && a[3] === b[3]
}

/** Heuristic value of a board: every row and every column scored independently and summed. */
export function evaluate(rows: Rows): number {
  const columns = transpose(rows)
  return (
    rowScoreTable[rows[0]] +
    rowScoreTable[rows[1]] +
    rowScoreTable[rows[2]] +
    rowScoreTable[rows[3]] +
    rowScoreTable[columns[0]] +
    rowScoreTable[columns[1]] +
    rowScoreTable[columns[2]] +
    rowScoreTable[columns[3]]
  )
}

/** Positions (row, 4-bit shift) of all empty cells. */
export function emptyCells(rows: Rows): { row: number; shift: number }[] {
  const cells: { row: number; shift: number }[] = []
  for (let row = 0; row < SIZE; row++) {
    for (let shift = 0; shift < 16; shift += 4) {
      if (((rows[row] >> shift) & 15) === 0) cells.push({ row, shift })
    }
  }
  return cells
}

/** A copy of the board with a tile of the given exponent placed on an empty cell. */
export function withTile(rows: Rows, row: number, shift: number, exponent: number): Rows {
  const next = [rows[0], rows[1], rows[2], rows[3]] as [number, number, number, number]
  next[row] |= exponent << shift
  return next
}
