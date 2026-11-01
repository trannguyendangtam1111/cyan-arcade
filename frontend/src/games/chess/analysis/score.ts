import type { Evaluation, Side } from '../types/chessTypes'

/**
 * The one score convention of the chess UI. Every evaluation the browser gets is from **White's
 * side**, whoever is to move: the server turns Stockfish's side-to-move scores round
 * (`Evaluation.fromEngine` in the backend), so nothing here ever looks at whose turn it is.
 *
 * - Centipawns: positive favours White, negative Black; shown in pawns with two decimals (`+0.34`).
 * - Mates are kept apart and never divided like centipawns: `#3` (White mates in 3), `#-2` (Black
 *   mates in 2), and `1-0` / `0-1` for mate on the board.
 * - The bar and graphs use White's winning chances, 0 to 100, from the server's logistic curve; a
 *   mate is 100 or 0 whatever its distance. Values are clamped to 0..100.
 *
 * The board's orientation never changes any of this: turning the board only moves where White's
 * share is drawn, not what it is.
 */

/** White's share of an evaluation bar, 0 to 100. */
export function whiteShare(evaluation: Evaluation): number {
  if (evaluation.kind === 'MATE' && evaluation.matingSide) return evaluation.matingSide === 'WHITE' ? 100 : 0
  const share = evaluation.whiteWinPercent
  if (!Number.isFinite(share)) return 50
  return Math.min(100, Math.max(0, share))
}

/** A side's share (its winning chances), 0 to 100. */
export function shareFor(evaluation: Evaluation, side: Side): number {
  const white = whiteShare(evaluation)
  return side === 'WHITE' ? white : 100 - white
}

/** The evaluation as boards write it: `+0.34`, `-1.20`, `0.00`, `#3`, `#-2`, `1-0`, `0-1`. */
export function scoreText(evaluation: Evaluation): string {
  if (evaluation.kind === 'MATE' && evaluation.matingSide && evaluation.mateIn !== null) {
    if (evaluation.mateIn === 0) return evaluation.matingSide === 'WHITE' ? '1-0' : '0-1'
    return evaluation.matingSide === 'WHITE' ? `#${evaluation.mateIn}` : `#-${evaluation.mateIn}`
  }
  const pawns = evaluation.centipawns / 100
  return `${evaluation.centipawns > 0 ? '+' : ''}${pawns.toFixed(2)}`
}
