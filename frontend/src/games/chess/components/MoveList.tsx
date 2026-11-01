import { ChevronDown, LoaderCircle, Radio } from 'lucide-react'
import { useEffect, useRef, type KeyboardEvent } from 'react'
import { cn } from '@/lib/cn'
import { movePairs } from '../engine/board'
import { viewName } from '../hooks/useBoardView'
import type { MoveClass, PlayedMove } from '../types/chessTypes'
import { QualityBadge } from './MoveFeedback'

/** What is known about a move's quality: a label (from a quick or a full analysis), or one on its way. */
export interface MoveLabel {
  classification: MoveClass | null
  pending: boolean
  /** From Coach Mode's quick analysis, not the game review's. */
  provisional?: boolean
}

interface MoveListProps {
  history: readonly PlayedMove[]
  /** The ply on the board: 0 for the start, `history.length` for the position now. */
  viewPly: number
  /** Whether the board shows the game as it stands (not an earlier position or a line). */
  live: boolean
  onSelect: (ply: number) => void
  labels: ReadonlyMap<number, MoveLabel>
  showLabels: boolean
  /** Taller, to see more moves at once. */
  expanded: boolean
  onToggle: () => void
  onKeyDown: (event: KeyboardEvent<HTMLElement>) => void
}

/**
 * The moves so far in standard algebraic notation, White and Black side by side by move number.
 * Each move is a button that shows the position after it on the board (the game itself does not
 * change). The move on the board is filled; the latest move of the game is outlined while the board
 * looks back. A label shows only once its analysis has arrived; one from Coach Mode's quick analysis
 * is drawn dashed until the game review confirms or replaces it.
 */
export function MoveList({ history, viewPly, live, onSelect, labels, showLabels, expanded, onToggle, onKeyDown }: MoveListProps) {
  const pairs = movePairs(history)
  const list = useRef<HTMLOListElement>(null)
  const latest = history.length
  const previous = useRef({ viewPly, latest })

  // Scroll to the move on the board when the player moves through the game, or when a new move
  // arrives while following it; never when a move arrives while the player looks back (they may
  // be reading older moves). Only the list scrolls, never the page.
  useEffect(() => {
    const before = previous.current
    previous.current = { viewPly, latest }
    const navigated = before.viewPly !== viewPly
    const followed = live && before.latest !== latest
    const element = list.current
    if (!element || !(navigated || followed)) return
    const cell = element.querySelector<HTMLElement>('[aria-current="step"]')
    if (!cell) {
      if (live) element.scrollTop = element.scrollHeight
      return
    }
    if (cell.offsetTop < element.scrollTop) element.scrollTop = cell.offsetTop - 4
    else if (cell.offsetTop + cell.offsetHeight > element.scrollTop + element.clientHeight) {
      element.scrollTop = cell.offsetTop + cell.offsetHeight - element.clientHeight + 4
    }
  }, [viewPly, latest, live])

  return (
    <section aria-labelledby="chess-moves" className="flex min-w-0 flex-col gap-1.5" onKeyDown={onKeyDown}>
      <div className="flex items-center gap-2">
        <h2 id="chess-moves" className="font-display text-sm font-semibold tracking-wide text-ink-soft uppercase">
          Moves
        </h2>
        <span
          data-testid="view-indicator"
          className={cn(
            'inline-flex min-w-0 items-center gap-1 truncate rounded-full px-2 py-0.5 text-xs font-bold',
            live ? 'bg-(--accent)/15 text-ink' : 'bg-amber-100 text-amber-900',
          )}
        >
          {live && <Radio aria-hidden className="size-3" />}
          {viewName(viewPly, live, history)}
        </span>
        {pairs.length > 6 && (
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={expanded}
            aria-controls="chess-move-list"
            aria-label={expanded ? 'Show fewer moves at once' : 'Show more moves at once'}
            title={expanded ? 'Show fewer moves at once' : 'Show more moves at once'}
            className="ml-auto grid size-7 place-items-center rounded-full hover:bg-surface"
          >
            <ChevronDown aria-hidden className={cn('size-4 transition-transform', expanded && 'rotate-180')} />
          </button>
        )}
      </div>
      {pairs.length === 0 ? (
        <p className="text-sm text-ink-soft">No moves yet. White starts.</p>
      ) : (
        <ol
          id="chess-move-list"
          ref={list}
          aria-label="Moves played"
          className={cn(
            'relative grid grid-cols-[2rem_minmax(0,1fr)_minmax(0,1fr)] gap-x-1 overflow-y-auto rounded-control bg-surface-muted p-1 text-sm',
            expanded ? 'max-h-96' : 'max-h-36',
          )}
        >
          {pairs.map((pair) => (
            <li key={pair.number} className={cn('contents')}>
              <span className="py-1 pr-1 text-right text-xs font-bold text-ink-soft tabular-nums">{pair.number}.</span>
              <Cell move={pair.white} viewPly={viewPly} latest={latest} live={live} label={labels.get(pair.white?.ply ?? -1)} showLabels={showLabels} onSelect={onSelect} />
              <Cell move={pair.black} viewPly={viewPly} latest={latest} live={live} label={labels.get(pair.black?.ply ?? -1)} showLabels={showLabels} onSelect={onSelect} />
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}

function Cell({
  move,
  viewPly,
  latest,
  live,
  label,
  showLabels,
  onSelect,
}: {
  move: PlayedMove | null
  viewPly: number
  latest: number
  live: boolean
  label: MoveLabel | undefined
  showLabels: boolean
  onSelect: (ply: number) => void
}) {
  if (!move) return <span />
  const shown = move.ply === viewPly
  const classification = showLabels && label?.classification ? label.classification : null
  const pending = showLabels && label?.pending
  const side = move.color === 'WHITE' ? 'White' : 'Black'
  const latestMove = move.ply === latest
  return (
    <button
      type="button"
      onClick={() => onSelect(move.ply)}
      aria-current={shown ? 'step' : undefined}
      aria-label={`${side}: ${move.san}${classification ? `, ${labelText(classification, label?.provisional)}` : ''}${pending ? ', being judged' : ''}`}
      data-ply={move.ply}
      data-latest={latestMove || undefined}
      className={cn(
        'flex min-w-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-left font-mono font-semibold outline-none focus-visible:ring-2 focus-visible:ring-brand-400',
        shown ? 'bg-(--accent) text-(--accent-ink)' : 'text-ink hover:bg-surface',
        !live && latestMove && !shown && 'ring-2 ring-(--accent) ring-inset',
      )}
    >
      <span className="truncate">{move.san}</span>
      {classification && <QualityBadge move={{ classification }} provisional={label?.provisional} className="ml-auto shrink-0" />}
      {pending && <LoaderCircle aria-hidden className="ml-auto size-3.5 shrink-0 animate-spin opacity-70" />}
    </button>
  )
}

const LABEL_NAMES: Record<MoveClass, string> = {
  BEST: 'Best',
  EXCELLENT: 'Excellent',
  GOOD: 'Good',
  INACCURACY: 'Inaccuracy',
  MISTAKE: 'Mistake',
  BLUNDER: 'Blunder',
  FORCED: 'Forced',
  UNRATED: 'Not rated',
}

function labelText(classification: MoveClass, provisional: boolean | undefined) {
  return `${LABEL_NAMES[classification]}${provisional ? ' (quick analysis)' : ''}`
}
