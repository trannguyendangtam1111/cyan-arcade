import { nextRandom, randomInt } from '@/games/shared/random'
import type {
  Board,
  Game2048Rules,
  Game2048State,
  Move,
  MoveLimitOutcome,
  PuzzleOutcome,
  SlideResult,
  TimeAttackOutcome,
} from '../types/game2048Types'

/**
 * 2048 rules as pure functions. `applyMove(state, move)` always returns the same result for the
 * same input, because the random tile spawns are driven by the seed stored in the state.
 */

export type {
  Board,
  Game2048Clock,
  Game2048Rules,
  Game2048State,
  Move,
  MoveLimitOutcome,
  PuzzleOutcome,
  SlideResult,
  TimeAttackOutcome,
} from '../types/game2048Types'

export const MOVES: readonly Move[] = ['UP', 'DOWN', 'LEFT', 'RIGHT']

export const SIZE = 4
export const WINNING_TILE = 2048

/** The valid moves a Moves Limit run has. */
export const MOVES_LIMIT = 300

/** The game time a Time Attack run has: two minutes. */
export const TIME_ATTACK_MS = 120_000

/** The clock's fixed step. Game time only ever moves in whole steps, whatever the frame rate. */
export const CLOCK_STEP_MS = 10

/** The game time each valid AI move costs in a timed run, whatever the playback speed. */
export const AI_MOVE_GAME_MS = 250

const AI_MOVE_STEPS = AI_MOVE_GAME_MS / CLOCK_STEP_MS

const FOUR_PROBABILITY = 0.1

/** The largest tile a board can hold (the same bound the server uses). */
const LARGEST_TILE = 1 << 17

/**
 * For each move, the four lines of cell indices, each ordered starting from the edge the tiles
 * slide towards. Sliding a board is then "slide every line towards its first index".
 */
const LINES: Record<Move, number[][]> = {
  LEFT: lines((line, i) => line * SIZE + i),
  RIGHT: lines((line, i) => line * SIZE + (SIZE - 1 - i)),
  UP: lines((line, i) => i * SIZE + line),
  DOWN: lines((line, i) => (SIZE - 1 - i) * SIZE + line),
}

function lines(cellAt: (line: number, i: number) => number): number[][] {
  return Array.from({ length: SIZE }, (_, line) => Array.from({ length: SIZE }, (_, i) => cellAt(line, i)))
}

/**
 * A new game on this seed. Without rules it is Classic, exactly as it always was. Each rule is opt-in:
 * `moveLimit` ends the run after that many valid moves (Moves Limit); `timeLimitMs` ends it once that
 * much game time has been played (Time Attack). `startBoard` and `target` make a Puzzle: the run starts
 * from that board and is cleared the moment the target tile is made. Without a start board the same
 * seed starts and spawns the same way in every mode; with one, the seed drives the spawns only.
 */
export function createGame2048(seed: number, rules: Game2048Rules = {}): Game2048State {
  const { moveLimit, timeLimitMs, startBoard, target } = rules
  if (moveLimit !== undefined && !(Number.isInteger(moveLimit) && moveLimit > 0)) {
    throw new RangeError(`A move limit is a positive whole number, not ${moveLimit}`)
  }
  if (
    timeLimitMs !== undefined &&
    !(Number.isInteger(timeLimitMs) && timeLimitMs > 0 && timeLimitMs % CLOCK_STEP_MS === 0)
  ) {
    throw new RangeError(`A time limit is a positive whole number of ${CLOCK_STEP_MS} ms steps, not ${timeLimitMs}`)
  }
  if (startBoard !== undefined) checkStartBoard(startBoard)
  if (target !== undefined) {
    const highestStart = startBoard === undefined ? 4 : highestTile(startBoard)
    if (!(isTile(target) && target > highestStart)) {
      throw new RangeError(`A target is a tile above the starting board's highest (${highestStart}), not ${target}`)
    }
  }
  const empty: Game2048State = {
    board: new Array<number>(SIZE * SIZE).fill(0),
    tileIds: new Array<number>(SIZE * SIZE).fill(0),
    nextTileId: 1,
    score: 0,
    moves: 0,
    won: false,
    status: 'playing',
    seed,
    ...(moveLimit !== undefined && { moveLimit }),
    ...(timeLimitMs !== undefined && { clock: { elapsedMs: 0, limitMs: timeLimitMs, timeUp: false } }),
    ...(target !== undefined && { target }),
  }
  if (startBoard === undefined) return spawnTile(spawnTile(empty))

  // A fixed start: its tiles numbered in reading order, and nothing spawned until the first move.
  let nextTileId = 1
  const tileIds = startBoard.map((value) => (value === 0 ? 0 : nextTileId++))
  return { ...empty, board: [...startBoard], tileIds, nextTileId }
}

function isTile(value: number): boolean {
  return Number.isInteger(value) && value >= 2 && value <= LARGEST_TILE && (value & (value - 1)) === 0
}

/** A start board is 16 cells, each empty or a tile, and leaves at least one legal move. */
function checkStartBoard(board: Board): void {
  if (board.length !== SIZE * SIZE || !board.every((value) => value === 0 || isTile(value))) {
    throw new RangeError('A start board is 16 cells, each 0 or a power of two from 2')
  }
  if (legalMoves(board).length === 0) throw new RangeError('A start board needs a legal move')
}

/** Slides and merges without spawning a new tile. This is the deterministic half of a move. */
export function slide(board: Board, move: Move): SlideResult {
  const next = new Array<number>(SIZE * SIZE).fill(0)
  const origins: number[][] = Array.from({ length: SIZE * SIZE }, () => [])
  let gained = 0
  let moved = false

  for (const line of LINES[move]) {
    let target = 0
    // Whether the tile currently at `target - 1` may still absorb an equal neighbour.
    let canMerge = false

    for (const cell of line) {
      const value = board[cell]
      if (value === 0) continue

      const previous = line[target - 1]
      if (canMerge && next[previous] === value) {
        next[previous] = value * 2
        origins[previous].push(cell)
        gained += value * 2
        canMerge = false // a tile merges at most once per move
        moved = true
      } else {
        const destination = line[target++]
        next[destination] = value
        origins[destination].push(cell)
        canMerge = true
        if (destination !== cell) moved = true
      }
    }
  }
  return { board: next, gained, moved, origins }
}

export function legalMoves(board: Board): Move[] {
  return MOVES.filter((move) => slide(board, move).moved)
}

export function highestTile(board: Board): number {
  return Math.max(...board)
}

/**
 * Applies a move and spawns a tile. Illegal moves (nothing slides) return the same state, so they
 * never count as a move. The game is over when no move is left or, with a move limit, right after
 * the last allowed move; a timed run also ends when its clock runs out (`advanceClock`). A Puzzle run
 * ends the moment its target tile is made, with no spawn after that move, and making it on the last
 * allowed move clears it too. Moves are refused once the game is over. Making 2048 only sets `won`;
 * outside a Puzzle it never ends or stops the game.
 */
export function applyMove(state: Game2048State, move: Move): Game2048State {
  if (state.status !== 'playing') return state

  const result = slide(state.board, move)
  if (!result.moved) return state

  let nextTileId = state.nextTileId
  const tileIds = result.origins.map((sources) => {
    if (sources.length === 0) return 0
    return sources.length === 1 ? state.tileIds[sources[0]] : nextTileId++
  })

  const moved: Game2048State = {
    ...state,
    board: result.board,
    tileIds,
    nextTileId,
    score: state.score + result.gained,
    moves: state.moves + 1,
    won: state.won || highestTile(result.board) >= WINNING_TILE,
  }
  if (state.target !== undefined && highestTile(result.board) >= state.target) return { ...moved, status: 'over' }

  const spawned = spawnTile(moved)
  const limitReached = spawned.moveLimit !== undefined && spawned.moves >= spawned.moveLimit
  return limitReached || legalMoves(spawned.board).length === 0 ? { ...spawned, status: 'over' } : spawned
}

/** The valid moves a Moves Limit run has left; `null` without a limit (Classic). */
export function movesLeft(state: Game2048State): number | null {
  return state.moveLimit === undefined ? null : Math.max(0, state.moveLimit - state.moves)
}

/**
 * How a Moves Limit run stands, from the state alone: `limit-reached` once every move is used (also
 * when the last one left no move, since the run used its whole budget), `stuck` when it ended earlier
 * with no move left. `null` without a limit (Classic).
 */
export function moveLimitOutcome(state: Game2048State): MoveLimitOutcome | null {
  if (state.moveLimit === undefined) return null
  if (state.moves >= state.moveLimit) return 'limit-reached'
  return state.status === 'over' ? 'stuck' : 'playing'
}

/**
 * How a Puzzle run stands, from the state alone: `cleared` once its target is made (also on the last
 * allowed move), `out-of-moves` when every move is used without it, `stuck` when it ended earlier with
 * no move left. `null` without a target.
 */
export function puzzleOutcome(state: Game2048State): PuzzleOutcome | null {
  if (state.target === undefined) return null
  if (highestTile(state.board) >= state.target) return 'cleared'
  if (state.status === 'playing') return 'playing'
  return state.moveLimit !== undefined && state.moves >= state.moveLimit ? 'out-of-moves' : 'stuck'
}

/**
 * Whether making 2048 stops to ask a player to keep going: in Classic only. A run with rules of its
 * own (a move limit, a clock, a target) plays straight on; reaching 2048 there is just a tile.
 */
export function asksToKeepGoing(state: Game2048State): boolean {
  return state.moveLimit === undefined && state.clock === undefined && state.target === undefined
}

/** Whether a timed run's clock has started: it starts with the run's first valid move. */
export function clockStarted(state: Game2048State): boolean {
  return state.clock !== undefined && state.moves > 0
}

/**
 * Advances a timed run's game time by whole clock steps. Nothing happens without a clock, before the
 * first valid move, or once the run is over. The clock never passes its limit, however many steps are
 * asked for: reaching the limit stops it exactly there and ends the run.
 */
export function advanceClock(state: Game2048State, steps = 1): Game2048State {
  if (!Number.isInteger(steps)) throw new RangeError(`Clock steps are whole numbers, not ${steps}`)
  const { clock } = state
  if (clock === undefined || state.status !== 'playing' || state.moves === 0 || steps <= 0) return state

  const elapsedMs = Math.min(clock.limitMs, clock.elapsedMs + steps * CLOCK_STEP_MS)
  if (elapsedMs < clock.limitMs) return { ...state, clock: { ...clock, elapsedMs } }
  return { ...state, status: 'over', clock: { ...clock, elapsedMs, timeUp: true } }
}

/**
 * A move made by the AI. In a timed run every valid AI move costs exactly `AI_MOVE_GAME_MS` of game time
 * (the first one included), however fast it is played back, so an AI run takes the same game time at
 * every speed. A no-op move costs nothing. Without a clock this is just `applyMove`.
 */
export function applyAiMove(state: Game2048State, move: Move): Game2048State {
  const after = applyMove(state, move)
  return after === state ? state : advanceClock(after, AI_MOVE_STEPS)
}

/** The game time a timed run has left; `null` without a clock. */
export function timeLeftMs(state: Game2048State): number | null {
  return state.clock === undefined ? null : state.clock.limitMs - state.clock.elapsedMs
}

/**
 * How a Time Attack run stands, from the state alone: `waiting` until the first valid move starts the
 * clock, `time-up` once the clock reached its limit, `stuck` when the run ended earlier with no move
 * left. `null` without a clock.
 */
export function timeAttackOutcome(state: Game2048State): TimeAttackOutcome | null {
  if (state.clock === undefined) return null
  if (state.clock.timeUp) return 'time-up'
  if (state.status === 'over') return 'stuck'
  return state.moves === 0 ? 'waiting' : 'playing'
}

/** Puts a 2 (90%) or a 4 (10%) on a uniformly random empty cell. */
function spawnTile(state: Game2048State): Game2048State {
  const emptyCells = state.board.flatMap((value, index) => (value === 0 ? [index] : []))
  if (emptyCells.length === 0) return state

  const cellPick = randomInt(state.seed, emptyCells.length)
  const valuePick = nextRandom(cellPick.seed)
  const cell = emptyCells[cellPick.value]

  const board = [...state.board]
  const tileIds = [...state.tileIds]
  board[cell] = valuePick.value < FOUR_PROBABILITY ? 4 : 2
  tileIds[cell] = state.nextTileId

  return { ...state, board, tileIds, nextTileId: state.nextTileId + 1, seed: valuePick.seed }
}
