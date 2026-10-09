import { aiActionDelay, type AiSpeed } from '@/games/shared/ai'
import { bit, candidates, CELLS, parseBoard } from '../engine/grid'
import type { AiMove, AiSolution, Strategy } from '../types/sudokuTypes'

/**
 * The browser side of Sudoku's AI. The solving happens on the server, where the AI's moves are
 * checked through a real game of the puzzle and only an admin may ask for them; this turns them into
 * something to watch, one move at a time.
 *
 * Speed only stretches or squeezes the waits. The moves come from the server and are the same at
 * every speed.
 */

/** Waits at 1x, in milliseconds, before each kind of move. */
export const BASE_DELAYS: Record<AiMove['kind'], number> = {
  PLACE: 650,
  ELIMINATE: 1000,
  GUESS: 500,
  BACKTRACK: 700,
}

/** Each strategy's pace: teaching leaves time to read, the search is quick. */
export const STRATEGY_PACE: Record<Strategy, number> = {
  STEP_BY_STEP: 1,
  FAST: 0.35,
  TEACHING: 2.4,
}

/** The board after some of the moves. */
export interface AiFrame {
  values: number[]
  /** Candidates left in each empty cell after the eliminations so far: the teaching board's notes. */
  candidates: number[]
  /** Candidates the move just played removed, per cell. */
  struck: Map<number, number>
  /** The move just played, if any. */
  last: AiMove | null
  played: number
  done: boolean
}

export interface SudokuAiPlayer {
  delay(solution: AiSolution, move: AiMove, speed: AiSpeed): number
  frame(solution: AiSolution, played: number): AiFrame
}

export function createSudokuAiPlayer(): SudokuAiPlayer {
  return {
    delay(solution, move, speed) {
      return aiActionDelay(BASE_DELAYS[move.kind] * STRATEGY_PACE[solution.strategy], speed)
    },

    frame(solution, played) {
      const values = parseBoard(solution.givens)
      const removed = Array<number>(CELLS).fill(0)
      const shown = solution.moves.slice(0, Math.max(0, played))
      for (const move of shown) {
        if (move.kind === 'PLACE' || move.kind === 'GUESS') values[move.cell] = move.digit
        if (move.kind === 'BACKTRACK') for (const cell of move.cleared) values[cell] = 0
        if (move.kind === 'ELIMINATE') for (const [cell, digit] of eliminations(move)) removed[cell] |= bit(digit)
      }
      const last = shown.at(-1) ?? null
      const struck = new Map<number, number>()
      if (last?.kind === 'ELIMINATE') for (const [cell, digit] of eliminations(last)) struck.set(cell, (struck.get(cell) ?? 0) | bit(digit))
      return {
        values,
        candidates: values.map((value, cell) => (value === 0 ? candidates(values, cell) & ~removed[cell] : 0)),
        struck,
        last,
        played: shown.length,
        done: shown.length >= solution.moves.length,
      }
    },
  }
}

function eliminations(move: AiMove): [number, number][] {
  return move.eliminations.map((entry) => entry.split(':').map(Number) as [number, number])
}
