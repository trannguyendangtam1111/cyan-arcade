import { Eye, EyeOff } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/cn'
import { explain, moveQuality, QUALITY_TONES } from '../analysis/moveQuality'
import { scoreText } from '../analysis/score'
import type { ReviewedMove } from '../types/chessTypes'

/** A move's quality as a small badge: the symbol in its colour, named for screen readers and on hover. */
export function QualityBadge({ move, provisional = false, className }: { move: Pick<ReviewedMove, 'classification'>; provisional?: boolean; className?: string }) {
  const quality = moveQuality(move.classification)
  const name = `${quality.label}${provisional ? ' (quick analysis)' : ''}`
  if (!quality.symbol) {
    return (
      <span title={quality.meaning} aria-label={name} data-quality={move.classification} className={cn('rounded-full px-1 text-[0.6rem] leading-4 font-bold text-ink-soft ring-1 ring-line', className)}>
        n/r
      </span>
    )
  }
  return (
    <span
      title={`${quality.meaning}${provisional ? ' From a quick analysis; the game review looks deeper.' : ''}`}
      aria-label={name}
      role="img"
      data-quality={move.classification}
      data-provisional={provisional || undefined}
      className={cn(
        'inline-grid min-w-4 place-items-center rounded-full px-1 text-[0.65rem] leading-4 font-bold',
        provisional ? 'border border-dashed bg-surface' : 'text-white',
        className,
      )}
      style={provisional ? { color: quality.color, borderColor: quality.color } : { background: quality.color, color: quality.ink }}
    >
      {quality.symbol}
    </span>
  )
}

interface MoveFeedbackProps {
  move: ReviewedMove
  /** A quick judgement (Coach Mode) or the game review's. */
  source: 'quick' | 'review'
  /** Shows (or hides) Stockfish's better move on the board; the game itself does not change. */
  onShowBest?: () => void
  bestShown?: boolean
}

/**
 * One judged move, the same for Coach Mode and the game review: its label in full, the evaluation
 * before and after (always from White's side), the winning chances it gave away, a reason only when
 * the numbers show one, and Stockfish's better move, which can be shown on the board.
 */
export function MoveFeedback({ move, source, onShowBest, bestShown = false }: MoveFeedbackProps) {
  const quality = moveQuality(move.classification)
  const number = `${Math.ceil(move.ply / 2)}${move.color === 'WHITE' ? '.' : '…'}`
  const reason = explain(move)
  const better = move.best && move.best.uci !== move.uci && move.classification !== 'FORCED' ? move.best : null
  return (
    <div className="flex flex-col gap-1.5" data-testid="move-feedback">
      <p className="flex flex-wrap items-center gap-2">
        <strong className="font-mono">
          {number} {move.san}
          {quality.annotation}
        </strong>
        <span data-testid="classification" title={quality.meaning} className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold', QUALITY_TONES[quality.tone])}>
          {quality.symbol && <span aria-hidden>{quality.symbol}</span>}
          {quality.label}
        </span>
        {source === 'quick' && (
          <span className="rounded-full bg-surface px-2 py-0.5 text-[0.65rem] font-bold text-ink-soft ring-1 ring-line" title="A quick analysis of under a second a position: the game review looks deeper and may differ.">
            quick analysis
          </span>
        )}
      </p>
      {move.classification !== 'FORCED' && move.classification !== 'UNRATED' && (
        <p className="text-sm">
          <span className="font-mono">{scoreText(move.before)}</span> → <span className="font-mono">{scoreText(move.after)}</span>
          {move.loss !== null && move.classification !== 'BEST' && <span className="text-ink-soft"> · {move.loss} points of {move.color === 'WHITE' ? "White's" : "Black's"} winning chances lost</span>}
        </p>
      )}
      {reason && <p className="text-sm text-ink-soft">{reason}</p>}
      {better && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
          <span className="min-w-0">
            {['INACCURACY', 'MISTAKE', 'BLUNDER'].includes(move.classification) ? 'Better was ' : 'Stockfish preferred '}
            <strong className="font-mono">{better.san}</strong>
            {move.bestLine.length > 1 && <span className="font-mono text-ink-soft"> ({move.bestLine.join(' ')})</span>}
          </span>
          {onShowBest && (
            <Button size="sm" variant="ghost" onClick={onShowBest} aria-pressed={bestShown}>
              {bestShown ? <EyeOff aria-hidden className="size-4" /> : <Eye aria-hidden className="size-4" />}
              {bestShown ? 'Hide best move' : 'Show best move'}
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
