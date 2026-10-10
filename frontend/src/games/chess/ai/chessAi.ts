import type { Evaluation, MoveClass, ReviewedMove, Side } from '../types/chessTypes'

/**
 * Chess's AI mode in the browser (admins only): how to show what Stockfish found. Stockfish itself
 * runs on the server, which checks the caller on every request; this chunk only reaches admins, like
 * every game's AI (see GameModule.loadAi). Pure functions: no rules, no React, no requests.
 */
export interface ChessAi {
  /** How much of an evaluation bar belongs to `side`, in percent (a mate fills it). */
  barShare: (evaluation: Evaluation, side: Side) => number
  /** A sentence for the evaluation: "White is better (+0.34)", "Black mates in 2". */
  describe: (evaluation: Evaluation) => string
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

const CLASSIFICATIONS: Record<MoveClass, ClassificationInfo> = {
  BEST: { label: 'Best', symbol: '★', tone: 'best' },
  EXCELLENT: { label: 'Excellent', symbol: '!', tone: 'good' },
  GOOD: { label: 'Good', symbol: '', tone: 'good' },
  INACCURACY: { label: 'Inaccuracy', symbol: '?!', tone: 'inaccuracy' },
  MISTAKE: { label: 'Mistake', symbol: '?', tone: 'mistake' },
  BLUNDER: { label: 'Blunder', symbol: '??', tone: 'blunder' },
  FORCED: { label: 'Forced', symbol: '□', tone: 'neutral' },
  UNRATED: { label: 'Not rated', symbol: '', tone: 'neutral' },
}

const ERRORS: readonly MoveClass[] = ['INACCURACY', 'MISTAKE', 'BLUNDER']

const sideName = (side: Side) => (side === 'WHITE' ? 'White' : 'Black')

export function barShare(evaluation: Evaluation, side: Side): number {
  const white = Math.min(100, Math.max(0, evaluation.whiteWinPercent))
  return side === 'WHITE' ? white : 100 - white
}

export function describe(evaluation: Evaluation): string {
  if (evaluation.kind === 'MATE' && evaluation.matingSide) {
    const mater = sideName(evaluation.matingSide)
    if (evaluation.mateIn === 0) return `Checkmate: ${mater} has won`
    return `${mater} mates in ${evaluation.mateIn}`
  }
  if (!evaluation.favoured || Math.abs(evaluation.centipawns) < 25) return `About level (${evaluation.display})`
  const size = Math.abs(evaluation.centipawns)
  const how = size < 100 ? 'slightly better' : size < 300 ? 'better' : 'winning'
  return `${sideName(evaluation.favoured)} is ${how} (${evaluation.display})`
}

export function classification(label: MoveClass): ClassificationInfo {
  return CLASSIFICATIONS[label]
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
    if (ERRORS.includes(moves[at].classification)) return at
  }
  return null
}

export function createChessAi(): ChessAi {
  return { barShare, describe, classification, step, stepToError }
}
