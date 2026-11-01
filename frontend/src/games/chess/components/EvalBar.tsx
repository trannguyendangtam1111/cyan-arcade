import { GraduationCap, LoaderCircle, Play, RotateCcw } from 'lucide-react'
import { cn } from '@/lib/cn'
import { describe } from '../analysis/evaluationText'
import { scoreText, whiteShare } from '../analysis/score'
import type { EvaluationState } from '../hooks/useShownEvaluation'
import type { Evaluation, Side, Termination } from '../types/chessTypes'

/**
 * The bar's state: how its evaluation relates to the position on the board (see useShownEvaluation),
 * or, with none, why: `stopped` (the player stopped Stockfish) or `error` (it could not evaluate).
 */
export type EvalBarState = EvaluationState | 'stopped' | 'error'

/** What the player can do about an empty bar: evaluate again, start Stockfish, or turn Coach Mode on. */
export interface EvalBarAction {
  kind: 'retry' | 'start' | 'coach'
  label: string
  onClick: () => void
}

interface EvalBarProps {
  evaluation: Evaluation | null
  state?: EvalBarState
  /** Why there is no evaluation, said instead of the default sentence. */
  reason?: string
  action?: EvalBarAction | null
  provisional: boolean
  /** For a finished game, how it ended, so a resignation is not told as mate. */
  termination?: Termination | null
  /** Beside the board (desktop) or a strip (phones, panels). */
  layout?: 'horizontal' | 'vertical'
  /** The side at the bottom of the board: White's share is drawn on White's side of the bar. */
  bottom?: Side
}

const ACTION_ICONS = { retry: RotateCcw, start: Play, coach: GraduationCap }

/**
 * How the game stands, as a bar: White's share in white, Black's in dark, by the evaluation's winning
 * chances from White's side (analysis/score.ts; a mate fills it). Turning the board moves where
 * White's share is drawn, never its size. While a new position is being evaluated the last value
 * stays, dimmed, with a small spinner; with no evaluation the bar is empty and says why (none yet,
 * stopped, or failed) with what can be done about it, rather than claiming the position is equal.
 */
export function EvalBar({ evaluation, state = evaluation ? 'current' : 'unknown', reason, action, provisional, termination, layout = 'horizontal', bottom = 'WHITE' }: EvalBarProps) {
  const known = evaluation !== null
  const white = known ? whiteShare(evaluation) : 0
  const updating = state === 'previous' || state === 'loading'
  const failed = state === 'error'
  const sentence = known ? describe(evaluation, termination) : (reason ?? (updating ? 'Stockfish is evaluating this position' : 'No evaluation of this position yet'))
  const description = state === 'previous' ? `Updating; last evaluation: ${sentence}` : sentence
  const figure = known ? scoreText(evaluation) : failed ? '!' : '–'
  const meter = {
    role: 'meter',
    'aria-label': 'Evaluation',
    'aria-valuemin': 0,
    'aria-valuemax': 100,
    'aria-valuenow': known ? Math.round(white) : undefined,
    'aria-valuetext': description,
    'aria-busy': updating || undefined,
    'data-state': state,
  } as const
  const spinner = updating && <LoaderCircle aria-hidden className="size-3 shrink-0 animate-spin text-ink-soft" data-testid="eval-updating" />
  const Icon = action ? ACTION_ICONS[action.kind] : null
  const figureClass = cn('font-mono font-bold', provisional && 'italic', state === 'previous' && 'opacity-60', failed && 'text-rose-700')

  if (layout === 'vertical') {
    const whiteAtBottom = bottom === 'WHITE'
    return (
      <div className="flex h-full w-7 shrink-0 flex-col items-center gap-1" data-testid="eval-bar-vertical" title={description}>
        <div {...meter} className={cn('chess-eval-track relative w-full flex-1 overflow-hidden rounded-md ring-1', known ? 'bg-[#26364a]' : 'chess-eval-unknown', failed ? 'ring-rose-500' : 'ring-line')}>
          {known && (
            <span
              aria-hidden
              className={cn('chess-eval-fill absolute inset-x-0 bg-white', whiteAtBottom ? 'bottom-0' : 'top-0', state === 'previous' && 'opacity-60')}
              style={{ height: `${white}%` }}
            />
          )}
          <span aria-hidden className="absolute inset-x-0 top-1/2 h-px bg-[#f59e0b]" />
        </div>
        {action && Icon && (
          <button
            type="button"
            onClick={action.onClick}
            aria-label={`${action.label}: ${sentence}`}
            title={`${sentence}. ${action.label}`}
            className="grid size-7 shrink-0 place-items-center rounded-full bg-surface text-brand-700 ring-1 ring-line hover:ring-brand-300 active:scale-95"
            data-testid="eval-bar-action"
          >
            <Icon aria-hidden className="size-4" />
          </button>
        )}
        <span className="flex items-center gap-0.5">
          {spinner}
          <span className={cn(figureClass, 'text-[0.65rem] leading-none')} data-testid="eval-bar-figure">
            {figure}
          </span>
        </span>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2" title={description}>
      <div {...meter} className={cn('chess-eval-track relative h-4 min-w-0 flex-1 overflow-hidden rounded-full ring-1', known ? 'bg-[#26364a]' : 'chess-eval-unknown', failed ? 'ring-rose-500' : 'ring-line')}>
        {known && <span aria-hidden className={cn('chess-eval-fill absolute inset-y-0 left-0 bg-white', state === 'previous' && 'opacity-60')} style={{ width: `${white}%` }} />}
        <span aria-hidden className="absolute inset-y-0 left-1/2 w-px bg-[#f59e0b]" />
      </div>
      {spinner}
      {action && Icon && (
        <button
          type="button"
          onClick={action.onClick}
          aria-label={`${action.label}: ${sentence}`}
          title={sentence}
          className="inline-flex h-7 shrink-0 items-center gap-1 rounded-full bg-surface px-2.5 text-xs font-bold text-brand-700 ring-1 ring-line hover:ring-brand-300 active:scale-95"
          data-testid="eval-bar-action"
        >
          <Icon aria-hidden className="size-3.5" />
          {action.label}
        </button>
      )}
      <strong className={cn(figureClass, 'w-12 shrink-0 text-right text-sm')} data-testid="eval-bar-figure" title={provisional ? 'Provisional' : undefined}>
        {figure}
      </strong>
    </div>
  )
}
