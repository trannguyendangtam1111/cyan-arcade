import type { GameAI } from '@/games/shared/ai'
import type { Game2048State, Move } from '../engine/game2048Engine'
import { emptyCells, ensureTables, toRows } from './bitboard'
import { search, type SearchResult } from './expectimax'

/**
 * 2048 AI: depth-limited expectimax over the actual board, re-run from scratch after every move.
 * See `expectimax.ts` for the search and `bitboard.ts` for the evaluation.
 */

export interface Game2048Decision extends SearchResult {
  action: Move
}

export interface Game2048AI extends GameAI<Game2048State, Move> {
  /** Like `getNextAction`, but also returns the value of every move and the search depth. */
  decide(state: Game2048State): Game2048Decision
}

/**
 * How many tile spawns to look past. A crowded board has few empty cells, so each spawn branches
 * less and the search can afford to go deeper exactly when precision matters most.
 */
export function searchDepth(emptyCount: number): number {
  return emptyCount >= 6 ? 2 : 3
}

export function createGame2048Ai(): Game2048AI {
  ensureTables()

  const decide = (state: Game2048State): Game2048Decision => {
    const rows = toRows(state.board)
    const result = search(rows, searchDepth(emptyCells(rows).length))
    // With no legal move the game is already over; any answer is equally (ir)relevant.
    return { ...result, action: result.best ?? 'LEFT' }
  }

  return { decide, getNextAction: (state) => decide(state).action }
}
