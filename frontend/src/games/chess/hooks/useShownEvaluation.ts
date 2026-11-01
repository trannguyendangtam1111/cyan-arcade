import { useState } from 'react'
import type { Evaluation } from '../types/chessTypes'

/**
 * What the evaluation bar shows, and how sure it is:
 *
 * - `current`: an engine evaluation of exactly the position on the board;
 * - `previous`: none yet for this position, but one is on its way, so the last evaluation shown
 *   stays (marked as updating) instead of the bar snapping to an "equal" 50/50 it does not know;
 * - `loading`: one is on its way and there is nothing earlier to keep;
 * - `unknown`: no evaluation, and none coming. Shown as unknown, never as equal.
 */
export type EvaluationState = 'current' | 'previous' | 'loading' | 'unknown'

export interface ShownEvaluation {
  evaluation: Evaluation | null
  state: EvaluationState
}

/**
 * @param scope the match: an evaluation is never carried over into another match
 * @param position a stable name of the position on the board (its FEN, or the view's key)
 * @param current the evaluation of exactly that position, if there is one
 * @param pending whether one for it is being worked out (analysis, Coach Mode, the review)
 */
export function useShownEvaluation(scope: string | null, position: string | null, current: Evaluation | null, pending: boolean): ShownEvaluation {
  const [last, setLast] = useState<{ scope: string | null; position: string | null; evaluation: Evaluation } | null>(null)
  // Remember the last evaluation shown (derived state: set during render, React re-renders at once).
  if (current && (last === null || last.evaluation !== current || last.position !== position || last.scope !== scope)) {
    setLast({ scope, position, evaluation: current })
  }
  if (current) return { evaluation: current, state: 'current' }
  const kept = last !== null && last.scope === scope ? last.evaluation : null
  if (pending) return kept ? { evaluation: kept, state: 'previous' } : { evaluation: null, state: 'loading' }
  return { evaluation: null, state: 'unknown' }
}
