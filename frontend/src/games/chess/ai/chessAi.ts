import { barShare, describe } from '../analysis/evaluationText'
import { ERROR_CLASSES, moveQuality } from '../analysis/moveQuality'
import type { Evaluation, MoveClass, ReviewedMove, Side, Termination } from '../types/chessTypes'

/**
 * Chess's AI mode in the browser (admins only), handed to the game by the platform once the server
 * has said the player may use it: its presence is what shows the engine panels. Stockfish itself runs
 * on the server, which checks the caller on every request. The wording of evaluations and labels is
 * shared with Coach Mode (every signed-in player), so it lives with the game and is reused here.
 * Pure functions: no rules, no React, no requests.
 */
export interface ChessAi {
  /** How much of an evaluation bar belongs to `side`, in percent (a mate fills it). */
  barShare: (evaluation: Evaluation, side: Side) => number
  /**
   * A sentence for the evaluation: "White is better (+0.34)", "Black mates in 2". For a finished game,
   * `termination` tells a resignation from mate on the board.
   */
  describe: (evaluation: Evaluation, termination?: Termination | null) => string
  /** How a review label is shown. */
  classification: (label: MoveClass) => ClassificationInfo
  /** The next (or previous) reviewed move from `index`, or `null` at the end. */
  step: (moves: readonly ReviewedMove[], index: number | null, direction: 1 | -1) => number | null
  /** The next (or previous) move labelled Inaccuracy, Mistake or Blunder, or `null`. */
  stepToError: (moves: readonly ReviewedMove[], index: number | null, direction: 1 | -1) => number | null
}

export interface ClassificationInfo {
  label: string
  /** The annotation symbol chess writers use, if the label has one. */
  symbol: string
  tone: 'best' | 'good' | 'inaccuracy' | 'mistake' | 'blunder' | 'neutral'
}

export { barShare, describe }

export function classification(label: MoveClass): ClassificationInfo {
  const { label: name, symbol, tone } = moveQuality(label)
  return { label: name, symbol, tone }
}

export function step(moves: readonly ReviewedMove[], index: number | null, direction: 1 | -1): number | null {
  if (moves.length === 0) return null
  if (index === null) return direction === 1 ? 0 : moves.length - 1
  const next = index + direction
  return next >= 0 && next < moves.length ? next : null
}

export function stepToError(moves: readonly ReviewedMove[], index: number | null, direction: 1 | -1): number | null {
  let at = index === null ? (direction === 1 ? -1 : moves.length) : index
  for (at += direction; at >= 0 && at < moves.length; at += direction) {
    if (ERROR_CLASSES.includes(moves[at].classification)) return at
  }
  return null
}

export function createChessAi(): ChessAi {
  return { barShare, describe, classification, step, stepToError }
}
