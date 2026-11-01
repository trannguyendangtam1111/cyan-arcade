import type { Evaluation, MoveClass, ReviewedMove, Side } from '../types/chessTypes'
import { shareFor } from './score'

/**
 * How a move's quality is shown, wherever Stockfish's judgement of a move appears: Coach Mode (every
 * signed-in player), the game review and the board. The labels are the server's (one policy for
 * both, see the backend's MoveClassifier); nothing here judges a move.
 *
 * Symbols follow chess annotation where one exists: `!` Excellent, `?!` Inaccuracy, `?` Mistake,
 * `??` Blunder. Best is a star (the engine's own choice) and Good a tick, neither an annotation
 * symbol. Forced is `□`, the sign for an only move, and Not rated has no symbol at all: nothing is
 * claimed. There is no `!!` (Brilliant) or Great: the policy has no defensible test for them. These
 * symbols and limits are the arcade's, not a copy of any other site's classification.
 */
export interface MoveQuality {
  label: string
  /** The badge shown next to a move: an annotation symbol or a small icon; empty for none. */
  symbol: string
  /** What may follow the move in notation (`Nf3?`); empty when the label has no annotation symbol. */
  annotation: string
  tone: 'best' | 'good' | 'inaccuracy' | 'mistake' | 'blunder' | 'neutral'
  /** The colour of its badge on the board and in the move list. */
  color: string
  /** The colour of the symbol on that badge, when white would not read on it. */
  ink?: string
  /** A tooltip: what the label means. */
  meaning: string
}

export const MOVE_QUALITY: Record<MoveClass, MoveQuality> = {
  BEST: { label: 'Best', symbol: '★', annotation: '', tone: 'best', color: '#2f9e44', meaning: "Best: Stockfish's own first choice." },
  EXCELLENT: { label: 'Excellent', symbol: '!', annotation: '!', tone: 'best', color: '#0c8599', meaning: 'Excellent (!): not the engine\'s first choice, but it gave away almost none of the winning chances.' },
  GOOD: { label: 'Good', symbol: '✓', annotation: '', tone: 'good', color: '#1c7ed6', meaning: 'Good: a sound move that gave away a little.' },
  INACCURACY: { label: 'Inaccuracy', symbol: '?!', annotation: '?!', tone: 'inaccuracy', color: '#e8a800', ink: '#3d2c00', meaning: 'Inaccuracy (?!): a weaker move that gave away some winning chances.' },
  MISTAKE: { label: 'Mistake', symbol: '?', annotation: '?', tone: 'mistake', color: '#f76707', meaning: 'Mistake (?): it gave away a lot of the winning chances.' },
  BLUNDER: { label: 'Blunder', symbol: '??', annotation: '??', tone: 'blunder', color: '#e03131', meaning: 'Blunder (??): it gave away most of the winning chances, or allowed or missed a mate.' },
  FORCED: { label: 'Forced', symbol: '□', annotation: '', tone: 'neutral', color: '#868e96', meaning: 'Forced (□): the only legal move.' },
  UNRATED: { label: 'Not rated', symbol: '', annotation: '', tone: 'neutral', color: '#868e96', meaning: 'Not rated: the analysis was too shallow or uncertain to judge this move.' },
}

/** Text classes for a label's chip, by tone. */
export const QUALITY_TONES: Record<MoveQuality['tone'], string> = {
  best: 'bg-green-100 text-green-900',
  good: 'bg-sky-100 text-sky-800',
  inaccuracy: 'bg-yellow-100 text-yellow-900',
  mistake: 'bg-orange-100 text-orange-900',
  blunder: 'bg-rose-100 text-rose-800',
  neutral: 'bg-surface text-ink-soft',
}

export function moveQuality(label: MoveClass): MoveQuality {
  return MOVE_QUALITY[label]
}

/** Labels that point out an error, which "next mistake" steps between. */
export const ERROR_CLASSES: readonly MoveClass[] = ['INACCURACY', 'MISTAKE', 'BLUNDER']

/** Labels whose recommended alternative is worth showing first. */
export function worthAnAlternative(move: Pick<ReviewedMove, 'classification' | 'best' | 'uci'>): boolean {
  return move.best !== null && move.best.uci !== move.uci && ERROR_CLASSES.includes(move.classification)
}

const sideName = (side: Side) => (side === 'WHITE' ? 'White' : 'Black')
const other = (side: Side): Side => (side === 'WHITE' ? 'BLACK' : 'WHITE')

/** The mover's winning chances in percent for an evaluation (which is always from White's side). */
export function chancesFor(evaluation: Evaluation, side: Side): number {
  return shareFor(evaluation, side)
}

const matesFor = (evaluation: Evaluation, side: Side) => evaluation.kind === 'MATE' && evaluation.matingSide === side && (evaluation.mateIn ?? 0) > 0

/**
 * A short reason for a label, only where the engine's numbers show it plainly: a forced mate allowed
 * or missed, or the winning chances crossing from winning or level into losing. Otherwise `null`: no
 * explanation is invented (nothing about material or tactics, which the numbers alone do not show).
 */
export function explain(move: Pick<ReviewedMove, 'color' | 'classification' | 'before' | 'after'>): string | null {
  const mover = move.color
  const opponent = other(mover)
  if (move.classification === 'FORCED') return 'It was the only legal move.'
  if (move.classification === 'UNRATED') return 'The analysis was too shallow or uncertain to judge this move.'
  if (matesFor(move.after, opponent) && !matesFor(move.before, opponent)) {
    return `It allows ${sideName(opponent)} a forced mate in ${move.after.mateIn}.`
  }
  if (matesFor(move.before, mover) && !matesFor(move.after, mover) && !(move.after.kind === 'MATE' && move.after.mateIn === 0)) {
    return `It misses a forced mate: mate in ${move.before.mateIn} was there.`
  }
  if (!ERROR_CLASSES.includes(move.classification)) return null
  const before = chancesFor(move.before, mover)
  const after = chancesFor(move.after, mover)
  if (before >= 70 && after < 55) return 'It turns a winning position into an unclear one, or worse.'
  if (before >= 40 && after < 30) return `It turns a playable position into a difficult one for ${sideName(mover)}.`
  return null
}
