import type { Board, Game2048State } from '../types/game2048Types'
import { createGame2048 } from './game2048Engine'

/**
 * The six Puzzle stages of 2048. Each one is a fixed starting board, a fixed seed (which decides every
 * tile spawned after a move), a target tile and a budget of valid moves. A stage is cleared the moment
 * its target is made, the last allowed move included; using every move without it, or running out of
 * legal moves, fails it.
 *
 * The table is frozen: G2K-001b will declare the stages as the modes `puzzle-1` … `puzzle-6`, and the
 * server will judge a clear against the same boards, targets and budgets. The budgets come from
 * deterministic simulation (see ROADMAP.md, G2K-001a): every stage was cleared, on each of 100 seeds,
 * by a planner that knows the spawns well inside its budget, and its own seed is cleared by the
 * game's AI.
 */
export interface PuzzleStage {
  /** The stage's mode id. */
  mode: string
  /** 1 to 6, in the order the stages open. */
  number: number
  name: string
  /** What the stage asks of the player, beyond its target and budget. */
  description: string
  /** The starting board, row-major. Nothing is spawned before the first move. */
  board: Board
  /** Drives every spawn after a move, so a stage plays the same way each time. */
  seed: number
  /** The tile that clears the stage. */
  target: number
  /** The valid moves the stage allows; a move that changes nothing is not counted. */
  moveLimit: number
}

const rows = (...cells: number[][]): Board => Object.freeze(cells.flat())

export const PUZZLE_STAGES: readonly PuzzleStage[] = Object.freeze([
  {
    mode: 'puzzle-1',
    number: 1,
    name: 'First Steps',
    description: 'A nearly empty board with a 32 and a 16 to build on.',
    board: rows([0, 0, 0, 0], [0, 0, 2, 0], [0, 4, 0, 0], [32, 0, 0, 16]),
    seed: 10,
    target: 128,
    moveLimit: 60,
  },
  {
    mode: 'puzzle-2',
    number: 2,
    name: 'Chain Reaction',
    description: 'A 128-64-32-16 chain waits along the top edge: feed it without breaking it.',
    board: rows([128, 64, 32, 16], [0, 0, 0, 0], [0, 0, 0, 0], [2, 0, 4, 0]),
    seed: 9,
    target: 256,
    moveLimit: 20,
  },
  {
    mode: 'puzzle-3',
    number: 3,
    name: 'Clutter',
    description: 'A packed board of small, mixed tiles with a single gap.',
    board: rows([4, 2, 8, 2], [0, 8, 2, 4], [16, 4, 32, 8], [2, 16, 4, 2]),
    seed: 3,
    target: 128,
    moveLimit: 26,
  },
  {
    mode: 'puzzle-4',
    number: 4,
    name: 'Half Built',
    description: 'A 256, a 128 and a 64 in a row, and a stray 32 to bring home.',
    board: rows([256, 128, 64, 0], [0, 0, 0, 32], [0, 2, 0, 0], [0, 0, 0, 0]),
    seed: 1,
    target: 512,
    moveLimit: 36,
  },
  {
    mode: 'puzzle-5',
    number: 5,
    name: 'Locked Column',
    description: 'Two 256s at either end of a full column: clear the way between them.',
    board: rows([256, 4, 2, 4], [16, 2, 8, 0], [8, 4, 2, 8], [256, 2, 4, 2]),
    seed: 10,
    target: 512,
    moveLimit: 10,
  },
  {
    mode: 'puzzle-6',
    number: 6,
    name: 'Endgame',
    description: 'A 512-256-128-64 row, short of the tiles a 1024 needs: build the rest in time.',
    board: rows([512, 256, 128, 64], [2, 8, 16, 0], [4, 2, 4, 0], [2, 0, 0, 0]),
    seed: 3,
    target: 1024,
    moveLimit: 36,
  },
])

/** The stage with this mode id, if there is one. */
export function puzzleStage(mode: string): PuzzleStage | undefined {
  return PUZZLE_STAGES.find((stage) => stage.mode === mode)
}

/** A new run of the stage: its board, seed, target and move budget. */
export function createPuzzleGame(stage: PuzzleStage): Game2048State {
  return createGame2048(stage.seed, { startBoard: stage.board, target: stage.target, moveLimit: stage.moveLimit })
}
