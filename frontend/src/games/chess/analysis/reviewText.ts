import type { MoveClass, ReviewedMove, ReviewResponse, Side } from '../types/chessTypes'
import { ERROR_CLASSES, moveQuality } from './moveQuality'

const sideName = (side: Side) => (side === 'WHITE' ? 'White' : 'Black')

const PLURALS: Partial<Record<MoveClass, string>> = { INACCURACY: 'inaccuracies', MISTAKE: 'mistakes', BLUNDER: 'blunders' }

/** The ply of the previous or next move labelled an error, from `ply`, or `null`. */
export function errorFrom(moves: readonly ReviewedMove[], ply: number, direction: 1 | -1): number | null {
  for (let at = ply + direction; at >= 1 && at <= moves.length; at += direction) {
    if (ERROR_CLASSES.includes(moves[at - 1].classification)) return at
  }
  return null
}

/**
 * A few plain sentences from the review's own numbers: each side's accuracy and errors, and the move
 * that lost the most. Nothing in them comes from anywhere but the engine's analysis.
 */
export function reviewSummary(review: ReviewResponse): string[] {
  const lines: string[] = []
  for (const side of ['WHITE', 'BLACK'] as const) {
    const summary = side === 'WHITE' ? review.summary.white : review.summary.black
    const errors = ERROR_CLASSES.map((label) => [label, summary.counts[label] ?? 0] as const).filter(([, count]) => count > 0)
    const accuracy = summary.accuracy === null ? 'no rated moves' : `${summary.accuracy.toFixed(1)}% accuracy`
    const said =
      errors.length === 0
        ? 'no inaccuracies, mistakes or blunders'
        : errors.map(([label, count]) => `${count} ${count === 1 ? moveQuality(label).label.toLowerCase() : PLURALS[label]}`).join(', ')
    lines.push(`${sideName(side)}: ${accuracy}, ${said}.`)
  }
  const worst = review.moves
    .filter((move) => move.loss !== null && ERROR_CLASSES.includes(move.classification))
    .sort((a, b) => (b.loss ?? 0) - (a.loss ?? 0))[0]
  if (worst) {
    lines.push(`Biggest loss: ${Math.ceil(worst.ply / 2)}${worst.color === 'WHITE' ? '.' : '…'} ${worst.san}, ${worst.loss} points of winning chances${worst.best ? `; ${worst.best.san} was better` : ''}.`)
  }
  return lines
}
