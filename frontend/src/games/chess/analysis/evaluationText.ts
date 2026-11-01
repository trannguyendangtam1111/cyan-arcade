import type { Evaluation, Side, Termination } from '../types/chessTypes'
import { scoreText, shareFor } from './score'

/**
 * How an engine evaluation is put into words and onto a bar. Every evaluation is from White's side
 * (the server turns the engine's side-to-move scores round): positive centipawns favour White, a mate
 * names the side that mates. Mates are never shown as centipawns.
 */

const sideName = (side: Side) => (side === 'WHITE' ? 'White' : 'Black')

/** How much of an evaluation bar belongs to `side`, in percent, by winning chances (a mate fills it). */
export function barShare(evaluation: Evaluation, side: Side): number {
  return shareFor(evaluation, side)
}

/**
 * A sentence for the evaluation: "White is better (+0.34)", "Black mates in 2". For a finished game,
 * `termination` tells a resignation from mate on the board.
 */
export function describe(evaluation: Evaluation, termination?: Termination | null): string {
  if (evaluation.kind === 'MATE' && evaluation.matingSide) {
    const mater = sideName(evaluation.matingSide)
    if (evaluation.mateIn === 0) {
      if (termination === 'RESIGNATION') return `${mater} has won (${sideName(evaluation.matingSide === 'WHITE' ? 'BLACK' : 'WHITE')} resigned)`
      return `Checkmate: ${mater} has won`
    }
    return `${mater} mates in ${evaluation.mateIn}`
  }
  if (!evaluation.favoured || Math.abs(evaluation.centipawns) < 25) return `About level (${scoreText(evaluation)})`
  const size = Math.abs(evaluation.centipawns)
  const how = size < 100 ? 'slightly better' : size < 300 ? 'better' : 'winning'
  return `${sideName(evaluation.favoured)} is ${how} (${scoreText(evaluation)})`
}
