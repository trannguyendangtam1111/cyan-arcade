import { nextRandom, randomInt } from '@/games/shared/random'
import type { Board, Game2048State, Move, SlideResult } from '../types/game2048Types'

/**
 * 2048 rules as pure functions. `applyMove(state, move)` always returns the same result for the
 * same input, because the random tile spawns are driven by the seed stored in the state.
 */

export type { Board, Game2048State, Move, SlideResult } from '../types/game2048Types'

export const MOVES: readonly Move[] = ['UP', 'DOWN', 'LEFT', 'RIGHT']

export const SIZE = 4
export const WINNING_TILE = 2048

const FOUR_PROBABILITY = 0.1

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

export function createGame2048(seed: number): Game2048State {
  const empty: Game2048State = {
    board: new Array<number>(SIZE * SIZE).fill(0),
    tileIds: new Array<number>(SIZE * SIZE).fill(0),
    nextTileId: 1,
    score: 0,
    moves: 0,
    won: false,
    status: 'playing',
    seed,
  }
  return spawnTile(spawnTile(empty))
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

/** Applies a move and spawns a tile. Illegal moves (nothing slides) return the same state. */
export function applyMove(state: Game2048State, move: Move): Game2048State {
  if (state.status !== 'playing') return state

  const result = slide(state.board, move)
  if (!result.moved) return state

  let nextTileId = state.nextTileId
  const tileIds = result.origins.map((sources) => {
    if (sources.length === 0) return 0
    return sources.length === 1 ? state.tileIds[sources[0]] : nextTileId++
  })

  const spawned = spawnTile({
    ...state,
    board: result.board,
    tileIds,
    nextTileId,
    score: state.score + result.gained,
    moves: state.moves + 1,
    won: state.won || highestTile(result.board) >= WINNING_TILE,
  })
  return legalMoves(spawned.board).length === 0 ? { ...spawned, status: 'over' } : spawned
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
