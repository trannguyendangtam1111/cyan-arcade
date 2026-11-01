import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, LoaderCircle, SearchCheck, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/cn'
import { moveQuality } from '../analysis/moveQuality'
import { errorFrom, reviewSummary } from '../analysis/reviewText'
import { whiteShare } from '../analysis/score'
import type { MoveClass, ReviewResponse, Side, SideSummary } from '../types/chessTypes'
import { EvalGraph } from './EvalGraph'
import { MoveFeedback } from './MoveFeedback'

interface ReviewPanelProps {
  review: ReviewResponse | null
  error: string | null
  running: boolean
  finished: boolean
  /** The ply on the board (0 for the start). */
  ply: number
  /** The board follows the game (no move picked yet): stepping forward starts from the first move. */
  live: boolean
  onPly: (ply: number) => void
  side: 'before' | 'after'
  onSide: (side: 'before' | 'after') => void
  onStart: () => void
  onCancel: () => void
  onClose: () => void
}

const COUNTED: readonly MoveClass[] = ['BEST', 'EXCELLENT', 'GOOD', 'INACCURACY', 'MISTAKE', 'BLUNDER', 'FORCED', 'UNRATED']

const sideName = (side: Side) => (side === 'WHITE' ? 'White' : 'Black')

function SideCard({ side, summary }: { side: Side; summary: SideSummary }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-md bg-surface p-2" data-testid={`summary-${side.toLowerCase()}`}>
      <p className="flex items-baseline justify-between gap-1">
        <span className="text-xs font-bold tracking-wide text-ink-soft uppercase">{sideName(side)}</span>
        <strong className="font-display text-xl tabular-nums" aria-label={`${sideName(side)} accuracy`}>
          {summary.accuracy === null ? '—' : `${summary.accuracy.toFixed(1)}%`}
        </strong>
      </p>
      <ul className="flex flex-col gap-0.5 text-xs">
        {COUNTED.filter((label) => (summary.counts[label] ?? 0) > 0).map((label) => {
          const quality = moveQuality(label)
          return (
            <li key={label} className="flex items-center gap-1.5">
              <span aria-hidden className="grid size-4 shrink-0 place-items-center rounded-full text-[0.6rem] font-bold text-white" style={{ background: quality.color, color: quality.ink }}>
                {quality.symbol}
              </span>
              <span className="min-w-0 flex-1 truncate">{quality.label}</span>
              <span className="font-bold tabular-nums">{summary.counts[label]}</span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

/**
 * Admins: a finished game, move by move, as Stockfish sees it. Each side's accuracy and labels, a
 * graph of the winning chances, a short summary from those numbers, and each move with its label, the
 * evaluation before and after and the engine's alternative. Moves appear as their analysis arrives;
 * until the review is done everything is marked provisional. Reviewing changes nothing in the game.
 */
export function ReviewPanel({ review, error, running, finished, ply, live, onPly, side, onSide, onStart, onCancel, onClose }: ReviewPanelProps) {
  if (!review) {
    return (
      <section aria-labelledby="chess-review" className="flex flex-col gap-2 rounded-control bg-surface-muted p-3">
        <h2 id="chess-review" className="flex items-center gap-1.5 font-display text-base font-semibold">
          <SearchCheck aria-hidden className="size-4.5" />
          Game review
        </h2>
        <p className="text-sm text-ink-soft">{finished ? 'Stockfish analyses every move of the game.' : 'Available once the game is over.'}</p>
        <Button size="sm" variant="secondary" onClick={onStart} disabled={!finished}>
          Review game
        </Button>
        {error && (
          <p role="alert" className="text-sm font-semibold text-rose-700">
            {error}
          </p>
        )}
      </section>
    )
  }

  const moves = review.moves
  const current = ply >= 1 ? (moves[ply - 1] ?? null) : null
  const quality = current ? moveQuality(current.classification) : null
  const complete = review.status === 'DONE'
  const points = moves.length > 0 ? [{ ply: 0, white: whiteShare(moves[0].before) }, ...moves.map((move) => ({ ply: move.ply, white: whiteShare(move.after), classification: move.classification }))] : []
  const previousError = errorFrom(moves, ply, -1)
  const nextError = errorFrom(moves, live ? 0 : ply, 1)

  return (
    <section aria-labelledby="chess-review" className="flex flex-col gap-3 rounded-control bg-surface-muted p-3">
      <div className="flex items-center gap-2">
        <h2 id="chess-review" className="flex items-center gap-1.5 font-display text-base font-semibold">
          <SearchCheck aria-hidden className="size-4.5" />
          Game review
        </h2>
        <button type="button" onClick={onClose} aria-label="Close the review" className="ml-auto grid size-8 place-items-center rounded-full hover:bg-black/5">
          <X aria-hidden className="size-4" />
        </button>
      </div>

      {running && (
        <div className="flex items-center gap-2 text-sm text-ink-soft">
          <LoaderCircle aria-hidden className="size-4 animate-spin" />
          <span role="status">
            Analysing {review.analyzed} of {review.total} positions
          </span>
          <Button size="sm" variant="ghost" onClick={onCancel} className="ml-auto">
            Cancel
          </Button>
        </div>
      )}
      {(review.status === 'CANCELLED' || review.status === 'FAILED') && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <p role="alert" className="font-semibold text-rose-700">
            {review.status === 'CANCELLED' ? 'The review was cancelled.' : (review.error ?? 'The review failed.')}
          </p>
          <Button size="sm" variant="secondary" onClick={onStart} className="ml-auto">
            Resume
          </Button>
        </div>
      )}
      {error && (
        <p role="alert" className="text-sm font-semibold text-rose-700">
          {error}
        </p>
      )}

      {moves.length > 0 && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <SideCard side="WHITE" summary={review.summary.white} />
            <SideCard side="BLACK" summary={review.summary.black} />
          </div>
          {!complete && <p className="text-xs font-semibold text-amber-800">Provisional: {moves.length} of {review.total - 1} moves analysed so far.</p>}
          <EvalGraph points={points} selected={ply} onSelect={onPly} label={`White's winning chances through the game, ${moves.length} moves`} />
          {complete && (
            <ul className="flex flex-col gap-0.5 text-sm" aria-label="Summary">
              {reviewSummary(review).map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          )}
        </>
      )}

      <div className="flex items-center justify-between gap-1" role="group" aria-label="Review navigation">
        <Button size="sm" variant="ghost" onClick={() => previousError !== null && onPly(previousError)} aria-label="Previous inaccuracy, mistake or blunder" disabled={previousError === null}>
          <ChevronsLeft aria-hidden className="size-4" />
        </Button>
        <Button size="sm" variant="ghost" onClick={() => onPly(Math.max(1, ply - 1))} aria-label="Previous move" disabled={ply <= 1}>
          <ChevronLeft aria-hidden className="size-4" />
        </Button>
        <span className="text-xs font-bold text-ink-soft">{current ? `Move ${Math.ceil(current.ply / 2)}${current.color === 'WHITE' ? '' : '…'}` : `${moves.length} moves reviewed`}</span>
        <Button size="sm" variant="ghost" onClick={() => onPly(Math.min(moves.length, ply + 1))} aria-label="Next move" disabled={ply >= moves.length}>
          <ChevronRight aria-hidden className="size-4" />
        </Button>
        <Button size="sm" variant="ghost" onClick={() => nextError !== null && onPly(nextError)} aria-label="Next inaccuracy, mistake or blunder" disabled={nextError === null}>
          <ChevronsRight aria-hidden className="size-4" />
        </Button>
      </div>

      {current && quality && (
        <div className="flex flex-col gap-2 rounded-control bg-surface p-3" aria-live="polite">
          <MoveFeedback move={current} source="review" />
          <div role="radiogroup" aria-label="Board shows" className="grid grid-cols-2 gap-1.5">
            {(['before', 'after'] as const).map((option) => (
              <button
                key={option}
                type="button"
                role="radio"
                aria-checked={side === option}
                onClick={() => onSide(option)}
                className={cn('h-8 rounded-control text-xs font-bold ring-2', side === option ? 'ring-(--accent)' : 'ring-transparent hover:ring-line')}
              >
                {option === 'before' ? 'Before the move' : 'After the move'}
              </button>
            ))}
          </div>
        </div>
      )}
      <p className="text-xs text-ink-soft">
        Labels follow the winning chances a move gave away by Stockfish&apos;s evaluation ({review.engine}, {review.settings.movetimeMs} ms or depth {review.settings.depth} a position). Accuracy averages
        each judged move&apos;s score from those losses (a published curve, not Chess.com&apos;s formula); forced and unrated moves are left out.
      </p>
    </section>
  )
}
