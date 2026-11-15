import { randomInt } from '@/games/shared/random'
import type {
  Cell,
  Garbage,
  Piece,
  PieceType,
  Point,
  TetrisAction,
  TetrisChallenge,
  TetrisClock,
  TetrisState,
} from '../types/tetrisTypes'

/**
 * Tetris rules as pure functions. `updateTetris(state, action)` always returns the same result for
 * the same input: the piece order comes from a seeded "7-bag" shuffle kept in the state.
 *
 * Every change to a game goes through an action, whether it comes from a key press, from gravity
 * or from the AI. An action that has no effect (moving into a wall, a blocked rotation) returns
 * the very same state object, so callers can detect it with `===`.
 */

export type {
  Cell,
  Garbage,
  Piece,
  PieceType,
  Point,
  TetrisAction,
  TetrisChallenge,
  TetrisClock,
  TetrisState,
} from '../types/tetrisTypes'

/** The cell of a garbage block. */
export const GARBAGE: Garbage = 'G'

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

/**
 * Game time of one `STEP` of a timed game: 25 steps make a second. The same as the AI's frame
 * (`AI_FRAME_MS`), so a timed game's clock moves the same way for a player and for the AI.
 */
export const STEP_MS = 40

/** What makes a game timed. A Classic game has none. */
export interface TimedRules {
  /** Game time at which the run ends, a whole number of steps; `null` to keep time without a limit. */
  limitMs: number | null
  /**
   * Lines that end the run the moment a clear reaches them (Sprint's 40): the race is finished, at
   * the game time of that clear. Absent for a run without a goal.
   */
  lineGoal?: number
}

/** What makes a timed game a Challenge stage: garbage, a fixed gravity, and perhaps a dig objective. */
export interface ChallengeRules {
  /** The fixed level the stage is played at: its gravity, which clearing lines never changes. */
  level: number
  /** Rows of garbage the stage starts with, at the bottom. */
  garbageRows: number
  /** A row of garbage rises from the bottom after every this many pieces locked, or `null` for none. */
  riseEvery: number | null
  /** Won by clearing every garbage block; otherwise by the clock's `lineGoal`. */
  dig: boolean
}

/**
 * Mixed into a stage's seed to seed its garbage gaps, so the garbage and the piece bag draw from
 * streams of their own: the pieces of a stage are the same however its garbage falls.
 */
const GARBAGE_SEED_MIX = 0x9e3779b9

/** The most rows of garbage a stage may start with: room is left for the pieces to spawn and move. */
export const MOST_STARTING_GARBAGE = HEIGHT - 4

/**
 * A new game. Without `timed` it is Classic, exactly as before timed games existed: no clock, and
 * gravity is the `TICK` its player's timer sends. With `challenge` too (a timed game only) it is a
 * Challenge stage, the one kind of game with garbage.
 */
export function createTetrisGame(seed: number, timed?: TimedRules, challenge?: ChallengeRules): TetrisState {
  const bag = refillQueue([], seed)
  const [first, ...queue] = bag.queue
  const state: TetrisState = {
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
  if (challenge && !timed) throw new Error('A Challenge stage is a timed game: it needs a clock')
  if (!timed) return state

  const { limitMs, lineGoal = null } = timed
  if (limitMs !== null && !(Number.isInteger(limitMs / STEP_MS) && limitMs > 0)) {
    throw new Error(`A time limit must be a positive whole number of ${STEP_MS} ms steps, not ${limitMs}`)
  }
  if (lineGoal !== null && !(Number.isInteger(lineGoal) && lineGoal > 0)) {
    throw new Error(`A line goal must be a positive whole number of lines, not ${lineGoal}`)
  }
  const clock: TetrisClock = { elapsedMs: 0, sinceGravityMs: 0, limitMs, timeUp: false, lineGoal, goalReached: false }
  if (!challenge) return { ...state, clock }
  return startChallenge({ ...state, clock }, seed, challenge)
}

/** Puts a stage's starting garbage on the empty board and sets its fixed level. */
function startChallenge(state: TetrisState, seed: number, rules: ChallengeRules): TetrisState {
  const { level, garbageRows, riseEvery, dig } = rules
  if (!(Number.isInteger(level) && level >= 1)) throw new Error(`A stage's level must be 1 or more, not ${level}`)
  if (!(Number.isInteger(garbageRows) && garbageRows >= 0 && garbageRows <= MOST_STARTING_GARBAGE)) {
    throw new Error(`A stage starts with 0 to ${MOST_STARTING_GARBAGE} rows of garbage, not ${garbageRows}`)
  }
  if (riseEvery !== null && !(Number.isInteger(riseEvery) && riseEvery > 0)) {
    throw new Error(`Garbage rises after a positive whole number of pieces, not ${riseEvery}`)
  }
  if (dig && garbageRows === 0) throw new Error('A dig stage needs garbage to dig')
  if (!dig && state.clock?.lineGoal == null) throw new Error('A stage needs an objective: a line goal, or to dig')

  let challenge: TetrisChallenge = {
    level,
    riseEvery,
    dig,
    garbageAdded: 0,
    garbageCleared: 0,
    lastGap: -1,
    garbageSeed: (seed ^ GARBAGE_SEED_MIX) | 0,
  }
  // Top row first, each row's gap away from the one above it; the bottom row is the latest.
  const board = [...state.board]
  for (let y = HEIGHT - garbageRows; y < HEIGHT; y++) {
    const row = nextGarbageRow(challenge)
    board.splice(y * WIDTH, WIDTH, ...row.cells)
    challenge = row.challenge
  }
  return { ...state, board, level, challenge }
}

/** The next row of garbage: full but for one gap, in a different column from the previous row's. */
function nextGarbageRow(challenge: TetrisChallenge): { cells: Cell[]; challenge: TetrisChallenge } {
  const first = challenge.lastGap < 0
  const pick = randomInt(challenge.garbageSeed, first ? WIDTH : WIDTH - 1)
  const gap = !first && pick.value >= challenge.lastGap ? pick.value + 1 : pick.value
  const cells = new Array<Cell>(WIDTH).fill(GARBAGE)
  cells[gap] = null
  return {
    cells,
    challenge: { ...challenge, garbageAdded: challenge.garbageAdded + 1, lastGap: gap, garbageSeed: pick.seed },
  }
}

/**
 * Pushes the board up one row and puts a row of garbage under it. `null` when the top row holds a
 * block, which the push would carry off the board: the stack has reached the top.
 */
function riseGarbage(board: Cell[], challenge: TetrisChallenge): { board: Cell[]; challenge: TetrisChallenge } | null {
  for (let x = 0; x < WIDTH; x++) if (board[x] !== null) return null
  const row = nextGarbageRow(challenge)
  return { board: [...board.slice(WIDTH), ...row.cells], challenge: row.challenge }
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
      // A timed game's gravity comes with its clock (`STEP`) alone, so nothing can add more.
      return state.clock ? state : stepDown(state, 0)
    case 'STEP':
      return state.clock ? step(state, state.clock) : state
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

/**
 * One step of a timed game's clock: `STEP_MS` of game time, then gravity if a gravity interval of
 * game time has passed since the last one (the rest carries over, so on average gravity keeps
 * `gravityDelay` exactly). The step that reaches the limit ends the run there, at exactly the limit.
 */
function step(state: TetrisState, clock: TetrisClock): TetrisState {
  const elapsedMs = clock.elapsedMs + STEP_MS
  if (clock.limitMs !== null && elapsedMs >= clock.limitMs) {
    return { ...state, status: 'over', clock: { ...clock, elapsedMs: clock.limitMs, timeUp: true } }
  }

  // At most one gravity step per clock step: the fastest gravity (90 ms) is slower than a step.
  const sinceGravityMs = clock.sinceGravityMs + STEP_MS
  const delay = gravityDelay(state.level)
  if (sinceGravityMs < delay) return { ...state, clock: { ...clock, elapsedMs, sinceGravityMs } }
  return stepDown({ ...state, clock: { ...clock, elapsedMs, sinceGravityMs: sinceGravityMs - delay } }, 0)
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
  const pieces = state.pieces + 1
  let challenge = state.challenge && {
    ...state.challenge,
    garbageCleared: state.challenge.garbageCleared + cleared.garbage,
  }
  // A race ends with the clear that reaches its goal, at that game time, however the board looks; a
  // dig stage with the clear that takes away its last garbage.
  const goalReached =
    (state.clock?.lineGoal != null && lines >= state.clock.lineGoal) ||
    (challenge !== undefined && challenge.dig && challenge.garbageCleared === challenge.garbageAdded)

  // A stage's garbage rises once the piece has locked and its lines are gone, unless that piece met
  // the objective. The falling piece is the next one, spawned onto the risen board.
  let nextBoard = cleared.board
  let toppedOut = false
  if (challenge && !goalReached && challenge.riseEvery !== null && pieces % challenge.riseEvery === 0) {
    const risen = riseGarbage(nextBoard, challenge)
    if (risen) ({ board: nextBoard, challenge } = risen)
    else toppedOut = true
  }

  const refilled = refillQueue(state.queue, state.seed)
  const [next, ...queue] = refilled.queue
  const piece = spawnPiece(next)

  return {
    board: nextBoard,
    piece,
    queue,
    score: state.score + LINE_SCORES[cleared.count] * state.level,
    lines,
    // A stage keeps its fixed level; every other game goes up a level every ten lines.
    level: challenge ? challenge.level : Math.floor(lines / LINES_PER_LEVEL) + 1,
    pieces,
    status: goalReached || toppedOut || collides(nextBoard, piece) ? 'over' : 'playing',
    seed: refilled.seed,
    // A timed game's clock goes on with the next piece; a Classic game still has none.
    ...(state.clock && { clock: goalReached ? { ...state.clock, goalReached } : state.clock }),
    ...(challenge && { challenge }),
  }
}

/** Clears the full rows. `garbage` counts those that were rows of garbage (completed by a piece). */
function clearLines(board: Cell[]): { board: Cell[]; count: number; garbage: number } {
  const fullRows: number[] = []
  let garbage = 0
  for (let y = 0; y < HEIGHT; y++) {
    let full = true
    let hasGarbage = false
    for (let x = 0; x < WIDTH && full; x++) {
      const cell = board[y * WIDTH + x]
      full = cell !== null
      if (cell === GARBAGE) hasGarbage = true
    }
    if (full) {
      fullRows.push(y)
      if (hasGarbage) garbage++
    }
  }
  if (fullRows.length === 0) return { board, count: 0, garbage: 0 }

  const kept = board.filter((_, index) => !fullRows.includes(Math.floor(index / WIDTH)))
  return { board: [...new Array<Cell>(fullRows.length * WIDTH).fill(null), ...kept], count: fullRows.length, garbage }
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
