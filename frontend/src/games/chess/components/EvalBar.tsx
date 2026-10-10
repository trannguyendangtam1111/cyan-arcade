import type { ChessAi } from '../ai/chessAi'
import type { Evaluation } from '../types/chessTypes'

/**
 * How the game stands, as a bar: White's share in white, Black's in dark, by the evaluation's win
 * chances (a mate fills it). The text says the same for those who do not read bars.
 */
export function EvalBar({ evaluation, ai, provisional }: { evaluation: Evaluation; ai: ChessAi; provisional: boolean }) {
  const white = ai.barShare(evaluation, 'WHITE')
  return (
    <div className="flex flex-col gap-1">
      <div
        role="meter"
        aria-label="Evaluation"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(white)}
        aria-valuetext={ai.describe(evaluation)}
        className="relative h-5 w-full overflow-hidden rounded-full bg-[#26364a] ring-1 ring-line"
      >
        <span aria-hidden className="absolute inset-y-0 left-0 bg-white transition-[width] duration-300 motion-reduce:transition-none" style={{ width: `${white}%` }} />
        <span aria-hidden className="absolute inset-y-0 left-1/2 w-px bg-[#f59e0b]" />
      </div>
      <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
        <strong className="font-mono text-base" data-testid="evaluation-display">
          {evaluation.display}
        </strong>
        <span className="text-ink-soft">{ai.describe(evaluation)}</span>
        {provisional && <span className="rounded-full bg-warning/20 px-2 text-xs font-bold">provisional</span>}
      </p>
    </div>
  )
}
