import { randomInt } from '@/games/shared/random'
import type { Cell, Piece, PieceType, Point, TetrisAction, TetrisState } from '../types/tetrisTypes'

/**
 * Tetris rules as pure functions. `updateTetris(state, action)` always returns the same result for
 * the same input: the piece order comes from a seeded "7-bag" shuffle kept in the state.
 *
 * Every change to a game goes through an action, whether it comes from a key press, from gravity
 * or from the AI. An action that has no effect (moving into a wall, a blocked rotation) returns
 * the very same state object, so callers can detect it with `===`.
 */

export type { Cell, Piece, PieceType, Point, TetrisAction, TetrisState } from '../types/tetrisTypes'

export const PIECE_TYPES: readonly PieceType[] = ['I', 'O', 'T', 'S', 'Z', 'J', 'L']

export const WIDTH = 10
export const HEIGHT = 20
/** How many upcoming pieces the player (and the AI) may see. */
export const PREVIEW_COUNT = 3

/** Cells of each piece in its spawn orientation, inside a square box of `size` cells. */
const BASE_SHAPES: Record<PieceType, { size: number; cells: [number, number][] }> = {
  I: { size: 4, cells: [[0, 1], [1, 1], [2, 1], [3, 1]] },
  O: { size: 2, cells: [[0, 0], [1, 0], [0, 1], [1, 1]] },
  T: { size: 3, cells: [[1, 0], [0, 1], [1, 1], [2, 1]] },
  S: { size: 3, cells: [[1, 0], [2, 0], [0, 1], [1, 1]] },
  Z: { size: 3, cells: [[0, 0], [1, 0], [1, 1], [2, 1]] },
  J: { size: 3, cells: [[0, 0], [0, 1], [1, 1], [2, 1]] },
  L: { size: 3, cells: [[2, 0], [0, 1], [1, 1], [2, 1]] },
}

/** SHAPES[type][rotation] = cell offsets from the box's top-left corner. */
const SHAPES = Object.fromEntries(
  PIECE_TYPES.map((type) => {
    const { size, cells } = BASE_SHAPES[type]
    const rotations: Point[][] = []
    let current = cells.map(([x, y]) => ({ x, y }))
    for (let rotation = 0; rotation < 4; rotation++) {
      rotations.push(current)
      // A quarter turn clockwise inside the box.
      current = current.map(({ x, y }) => ({ x: size - 1 - y, y: x }))
    }
    return [type, rotations]
  }),
) as Record<PieceType, Point[][]>

/** Positions tried, in order, when a rotation does not fit where the piece is ("wall kicks"). */
const KICKS: Point[] = [
  { x: 0, y: 0 },
  { x: -1, y: 0 },
  { x: 1, y: 0 },
  { x: 0, y: -1 },
  { x: -2, y: 0 },
  { x: 2, y: 0 },
]

const LINE_SCORES = [0, 100, 300, 500, 800]
const LINES_PER_LEVEL = 10
const SOFT_DROP_POINTS = 1
const HARD_DROP_POINTS = 2

export function createTetrisGame(seed: number): TetrisState {
  const bag = refillQueue([], seed)
  const [first, ...queue] = bag.queue
  return {
    board: new Array<Cell>(WIDTH * HEIGHT).fill(null),
    piece: spawnPiece(first),
    queue,
    score: 0,
    lines: 0,
    level: 1,
    pieces: 0,
    status: 'playing',
    seed: bag.seed,
  }
}

export function updateTetris(state: TetrisState, action: TetrisAction): TetrisState {
  if (state.status !== 'playing') return state

  switch (action) {
    case 'LEFT':
      return shift(state, -1)
    case 'RIGHT':
      return shift(state, 1)
    case 'ROTATE_CW':
      return rotate(state, 1)
    case 'ROTATE_CCW':
      return rotate(state, 3)
    case 'TICK':
      return stepDown(state, 0)
    case 'SOFT_DROP':
      return stepDown(state, SOFT_DROP_POINTS)
    case 'HARD_DROP': {
      const distance = dropDistance(state.board, state.piece)
      const landed = { ...state.piece, y: state.piece.y + distance }
      return lock({ ...state, piece: landed, score: state.score + distance * HARD_DROP_POINTS })
    }
  }
}

/** Board cells covered by a piece. */
export function pieceCells(piece: Piece): Point[] {
  return SHAPES[piece.type][piece.rotation].map((cell) => ({ x: piece.x + cell.x, y: piece.y + cell.y }))
}

/** True when the piece overlaps a wall, the floor or a locked cell. Space above the board is free. */
export function collides(board: readonly Cell[], piece: Piece): boolean {
  return !fits(board, piece, piece.x, piece.y)
}

/** How many rows the piece can fall before it lands. */
export function dropDistance(board: readonly Cell[], piece: Piece): number {
  let distance = 0
  while (fits(board, piece, piece.x, piece.y + distance + 1)) distance++
  return distance
}

/** Whether the piece's shape fits with its box at (x, y). Allocation-free: the AI calls this a lot. */
function fits(board: readonly Cell[], piece: Piece, x: number, y: number): boolean {
  for (const cell of SHAPES[piece.type][piece.rotation]) {
    const cx = x + cell.x
    const cy = y + cell.y
    if (cx < 0 || cx >= WIDTH || cy >= HEIGHT) return false
    if (cy >= 0 && board[cy * WIDTH + cx] !== null) return false
  }
  return true
}

/** Milliseconds between gravity steps at a level. */
export function gravityDelay(level: number): number {
  return Math.max(90, 800 - (level - 1) * 70)
}

function spawnPiece(type: PieceType): Piece {
  const size = BASE_SHAPES[type].size
  // The I piece sits in the second row of its box, so lift the box to put it on the top row.
  return { type, rotation: 0, x: Math.floor((WIDTH - size) / 2), y: type === 'I' ? -1 : 0 }
}

function shift(state: TetrisState, dx: number): TetrisState {
  const moved = { ...state.piece, x: state.piece.x + dx }
  return collides(state.board, moved) ? state : { ...state, piece: moved }
}

function rotate(state: TetrisState, quarterTurns: number): TetrisState {
  if (state.piece.type === 'O') return state

  const rotation = (state.piece.rotation + quarterTurns) % 4
  for (const kick of KICKS) {
    const turned = { ...state.piece, rotation, x: state.piece.x + kick.x, y: state.piece.y + kick.y }
    if (!collides(state.board, turned)) return { ...state, piece: turned }
  }
  return state
}

function stepDown(state: TetrisState, points: number): TetrisState {
  const moved = { ...state.piece, y: state.piece.y + 1 }
  if (collides(state.board, moved)) return lock(state)
  return { ...state, piece: moved, score: state.score + points }
}

/** Fixes the falling piece to the board, clears full lines and brings in the next piece. */
function lock(state: TetrisState): TetrisState {
  const cells = pieceCells(state.piece)
  // Locking with any part above the board means the stack has reached the top.
  if (cells.some(({ y }) => y < 0)) return { ...state, status: 'over' }

  const board = [...state.board]
  for (const { x, y } of cells) board[y * WIDTH + x] = state.piece.type

  const cleared = clearLines(board)
  const lines = state.lines + cleared.count
  const refilled = refillQueue(state.queue, state.seed)
  const [next, ...queue] = refilled.queue
  const piece = spawnPiece(next)

  return {
    board: cleared.board,
    piece,
    queue,
    score: state.score + LINE_SCORES[cleared.count] * state.level,
    lines,
    level: Math.floor(lines / LINES_PER_LEVEL) + 1,
    pieces: state.pieces + 1,
    status: collides(cleared.board, piece) ? 'over' : 'playing',
    seed: refilled.seed,
  }
}

function clearLines(board: Cell[]): { board: Cell[]; count: number } {
  const fullRows: number[] = []
  for (let y = 0; y < HEIGHT; y++) {
    let full = true
    for (let x = 0; x < WIDTH && full; x++) full = board[y * WIDTH + x] !== null
    if (full) fullRows.push(y)
  }
  if (fullRows.length === 0) return { board, count: 0 }

  const kept = board.filter((_, index) => !fullRows.includes(Math.floor(index / WIDTH)))
  return { board: [...new Array<Cell>(fullRows.length * WIDTH).fill(null), ...kept], count: fullRows.length }
}

/**
 * Keeps the queue long enough for the preview by appending shuffled "bags" of all seven pieces,
 * the standard Tetris randomiser: every piece appears once per seven, so droughts are impossible.
 */
function refillQueue(queue: readonly PieceType[], seed: number): { queue: PieceType[]; seed: number } {
  const result = [...queue]
  while (result.length <= PREVIEW_COUNT) {
    const bag = [...PIECE_TYPES]
    for (let i = bag.length - 1; i > 0; i--) {
      const pick = randomInt(seed, i + 1)
      seed = pick.seed
      ;[bag[i], bag[pick.value]] = [bag[pick.value], bag[i]]
    }
    result.push(...bag)
  }
  return { queue: result, seed }
}
