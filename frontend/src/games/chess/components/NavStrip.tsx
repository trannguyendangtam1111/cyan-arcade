import { ArrowUpDown, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Eraser, PenLine, Radio } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

interface NavStripProps {
  ply: number
  latest: number
  live: boolean
  /** In a line Stockfish suggests: the strip then steps through it. */
  inVariation: boolean
  label: string
  /** Moves played since the player started looking back. */
  newMoves: number
  onFirst: () => void
  onPrevious: () => void
  onNext: () => void
  onLive: () => void
  onFlip: () => void
  drawing: { enabled: boolean; on: boolean; count: number; toggle: () => void; clear: () => void }
}

function IconButton({ label, title, onClick, disabled, pressed, children }: { label: string; title?: string; onClick: () => void; disabled?: boolean; pressed?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={title ?? label}
      aria-pressed={pressed}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'grid size-10 shrink-0 place-items-center rounded-control text-ink transition-colors hover:bg-surface-muted focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:outline-none disabled:opacity-35',
        pressed && 'bg-(--accent) text-(--accent-ink) hover:bg-(--accent)',
      )}
    >
      {children}
    </button>
  )
}

/**
 * Under the board: stepping through the game (first, previous, next, the live game), which only
 * changes what the board shows, and the board's own tools (draw, clear, flip).
 */
export function NavStrip({ ply, latest, live, inVariation, label, newMoves, onFirst, onPrevious, onNext, onLive, onFlip, drawing }: NavStripProps) {
  return (
    <div className="flex w-full items-center gap-1" role="toolbar" aria-label="Moves and board tools">
      <div role="group" aria-label="Step through the game" className="flex shrink-0 items-center gap-0.5 max-sm:gap-0">
        <IconButton label="First position" title="The start position (the game does not change)" onClick={onFirst} disabled={ply === 0 && !inVariation}>
          <ChevronsLeft aria-hidden className="size-5" />
        </IconButton>
        <IconButton label="Previous move" title="The position before (only shows it; nothing is taken back)" onClick={onPrevious} disabled={ply === 0 && !inVariation}>
          <ChevronLeft aria-hidden className="size-5" />
        </IconButton>
        <IconButton label="Next move" title="The position after" onClick={onNext} disabled={live || (ply >= latest && !inVariation)}>
          <ChevronRight aria-hidden className="size-5" />
        </IconButton>
        <IconButton label="Latest position" title="Back to the live game" onClick={onLive} disabled={live}>
          <ChevronsRight aria-hidden className="size-5" />
        </IconButton>
      </div>
      <span
        data-testid="nav-indicator"
        className={cn(
          'inline-flex min-w-0 items-center gap-1 truncate rounded-full px-2 py-0.5 text-xs font-bold',
          live ? 'bg-(--accent)/15 text-ink' : 'bg-amber-100 text-amber-900',
        )}
      >
        {live && <Radio aria-hidden className="size-3" />}
        {label}
      </span>
      {!live && newMoves > 0 && (
        <button
          type="button"
          onClick={onLive}
          className="shrink-0 rounded-full bg-(--accent) px-2 py-0.5 text-xs font-bold whitespace-nowrap text-(--accent-ink)"
          data-testid="new-moves"
        >
          {newMoves === 1 ? '1 new move' : `${newMoves} new moves`} · live
        </button>
      )}
      <div className="ml-auto flex shrink-0 items-center gap-0.5 max-sm:gap-0">
        {drawing.enabled && (
          <IconButton label="Draw" title="Draw mode: tap a square, then another for an arrow or the same for a highlight" onClick={drawing.toggle} pressed={drawing.on}>
            <PenLine aria-hidden className="size-5" />
          </IconButton>
        )}
        {drawing.enabled && drawing.count > 0 && (
          <IconButton label={`Clear drawings (${drawing.count})`} onClick={drawing.clear}>
            <Eraser aria-hidden className="size-5" />
          </IconButton>
        )}
        <IconButton label="Flip" title="Turn the board round" onClick={onFlip}>
          <ArrowUpDown aria-hidden className="size-5" />
        </IconButton>
      </div>
    </div>
  )
}
