import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, LoaderCircle, SearchCheck, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/cn'
import type { ChessAi, ClassificationInfo } from '../ai/chessAi'
import type { ReviewResponse } from '../types/chessTypes'
import { EvalBar } from './EvalBar'

const TONES: Record<ClassificationInfo['tone'], string> = {
  best: 'bg-[#d1fae5] text-[#065f46]',
  good: 'bg-[#e0f2fe] text-[#075985]',
  inaccuracy: 'bg-[#fef3c7] text-[#92400e]',
  mistake: 'bg-[#ffedd5] text-[#9a3412]',
  blunder: 'bg-[#ffe4e6] text-[#9f1239]',
  neutral: 'bg-surface text-ink-soft',
}

interface ReviewPanelProps {
  ai: ChessAi
  review: ReviewResponse | null
  error: string | null
  running: boolean
  finished: boolean
  selected: number | null
  side: 'before' | 'after'
  onStart: () => void
  onCancel: () => void
  onClose: () => void
  onSelect: (index: number | null) => void
  onSide: (side: 'before' | 'after') => void
}

/**
 * Admins: a finished game, move by move, as Stockfish sees it: each move's label by the review's
 * published rules, the evaluation before and after, and the engine's preferred move. Moves appear as
 * their analysis arrives; the board shows the selected one.
 */
export function ReviewPanel({ ai, review, error, running, finished, selected, side, onStart, onCancel, onClose, onSelect, onSide }: ReviewPanelProps) {
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
          <p role="alert" className="text-sm font-semibold text-[#9f1239]">
            {error}
          </p>
        )}
      </section>
    )
  }

  const moves = review.moves
  const current = selected !== null ? moves[selected] : null
  const info = current ? ai.classification(current.classification) : null
  const go = (index: number | null) => index !== null && onSelect(index)

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
          <p role="alert" className="font-semibold text-[#9f1239]">
            {review.status === 'CANCELLED' ? 'The review was cancelled.' : (review.error ?? 'The review failed.')}
          </p>
          <Button size="sm" variant="secondary" onClick={onStart} className="ml-auto">
            Resume
          </Button>
        </div>
      )}
      {error && (
        <p role="alert" className="text-sm font-semibold text-[#9f1239]">
          {error}
        </p>
      )}

      <div className="flex items-center justify-between gap-1" role="group" aria-label="Review navigation">
        <Button size="sm" variant="ghost" onClick={() => go(ai.stepToError(moves, selected, -1))} aria-label="Previous inaccuracy, mistake or blunder" disabled={ai.stepToError(moves, selected, -1) === null}>
          <ChevronsLeft aria-hidden className="size-4" />
        </Button>
        <Button size="sm" variant="ghost" onClick={() => go(ai.step(moves, selected, -1))} aria-label="Previous move" disabled={ai.step(moves, selected, -1) === null}>
          <ChevronLeft aria-hidden className="size-4" />
        </Button>
        <span className="text-xs font-bold text-ink-soft">
          {current ? `Move ${Math.ceil(current.ply / 2)}${current.color === 'WHITE' ? '' : '…'}` : `${moves.length} moves reviewed`}
        </span>
        <Button size="sm" variant="ghost" onClick={() => go(ai.step(moves, selected, 1))} aria-label="Next move" disabled={ai.step(moves, selected, 1) === null}>
          <ChevronRight aria-hidden className="size-4" />
        </Button>
        <Button size="sm" variant="ghost" onClick={() => go(ai.stepToError(moves, selected, 1))} aria-label="Next inaccuracy, mistake or blunder" disabled={ai.stepToError(moves, selected, 1) === null}>
          <ChevronsRight aria-hidden className="size-4" />
        </Button>
      </div>

      {current && info && (
        <div className="flex flex-col gap-2 rounded-control bg-surface p-3" aria-live="polite">
          <p className="flex flex-wrap items-center gap-2">
            <strong className="font-mono text-lg">
              {Math.ceil(current.ply / 2)}
              {current.color === 'WHITE' ? '.' : '…'} {current.san}
              {info.symbol && !['★', '□'].includes(info.symbol) ? info.symbol : ''}
            </strong>
            <span data-testid="classification" className={cn('rounded-full px-2 py-0.5 text-xs font-bold', TONES[info.tone])}>
              {info.label}
            </span>
          </p>
          <EvalBar evaluation={side === 'before' ? current.before : current.after} ai={ai} provisional={current.classification === 'UNRATED'} />
          <p className="text-sm">
            Evaluation <span className="font-mono">{current.before.display}</span> → <span className="font-mono">{current.after.display}</span>
            {current.loss !== null && current.classification !== 'BEST' && current.classification !== 'FORCED' && (
              <span className="text-ink-soft"> · {current.loss} points of winning chances lost</span>
            )}
          </p>
          {current.best && current.best.uci !== current.uci && (
            <p className="text-sm">
              Stockfish preferred <strong className="font-mono">{current.best.san}</strong>
              {current.bestLine.length > 1 && <span className="font-mono text-ink-soft"> ({current.bestLine.join(' ')})</span>}
            </p>
          )}
          {current.classification === 'UNRATED' && <p className="text-xs text-ink-soft">The analysis was too shallow to judge this move.</p>}
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

      {moves.length > 0 && (
        <ol aria-label="Reviewed moves" className="grid max-h-56 grid-cols-2 gap-1 overflow-y-auto pr-1 text-sm">
          {moves.map((move, index) => {
            const label = ai.classification(move.classification)
            return (
              <li key={move.ply}>
                <button
                  type="button"
                  onClick={() => onSelect(index)}
                  aria-current={index === selected ? 'step' : undefined}
                  aria-label={`${move.color === 'WHITE' ? 'White' : 'Black'} ${move.san}: ${label.label}`}
                  className={cn('flex w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-left', index === selected ? 'bg-(--accent) text-(--accent-ink)' : 'hover:bg-surface')}
                >
                  <span className="w-7 shrink-0 text-right text-xs font-bold opacity-70">
                    {Math.ceil(move.ply / 2)}
                    {move.color === 'WHITE' ? '.' : '…'}
                  </span>
                  <span className="font-mono font-semibold">{move.san}</span>
                  <span className={cn('ml-auto rounded-full px-1.5 text-[0.65rem] font-bold', TONES[label.tone])}>{label.label}</span>
                </button>
              </li>
            )
          })}
        </ol>
      )}
      <p className="text-xs text-ink-soft">
        Labels follow the winning chances a move gave away by Stockfish&apos;s evaluation ({review.engine}, {review.settings.movetimeMs} ms or depth {review.settings.depth} a
        position). They are numbers, not explanations.
      </p>
    </section>
  )
}
