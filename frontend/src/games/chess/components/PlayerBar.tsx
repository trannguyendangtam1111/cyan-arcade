import { cn } from '@/lib/cn'
import { kindName, materialLead, otherSide, sideName, sortCaptured } from '../engine/board'
import type { PieceSet } from '../skins'
import type { MatchView, Side } from '../types/chessTypes'
import { PieceGlyph } from './PieceGlyph'

interface PlayerBarProps {
  side: Side
  match: MatchView
  pieces: PieceSet
}

/** One side's strip by the board: its name, whether it is to move, what it has taken and its lead. */
export function PlayerBar({ side, match, pieces }: PlayerBarProps) {
  const toMove = match.result === null && match.status === 'ACTIVE' && match.turn === side
  const won = match.result?.winner === side
  const taken = sortCaptured(match.captured[side])
  const lead = materialLead(match.material)
  const name = sideName(side)

  return (
    <div
      data-side={side}
      className={cn(
        'flex min-h-11 w-full items-center gap-2 rounded-control px-3 py-1.5 ring-2 transition-colors',
        toMove ? 'bg-(--accent)/10 ring-(--accent)' : 'bg-surface-muted ring-transparent',
      )}
    >
      <PieceGlyph piece={{ side, kind: 'k' }} set={pieces} className="size-7 shrink-0" />
      <span className="font-display font-semibold">{name}</span>
      {toMove && (
        <span className="rounded-full bg-(--accent) px-2 py-0.5 text-xs font-bold text-(--accent-ink)">
          {match.check ? 'In check' : 'To move'}
        </span>
      )}
      {won && <span className="rounded-full bg-warning/20 px-2 py-0.5 text-xs font-bold text-ink">Winner</span>}
      <span
        className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-0"
        aria-label={taken.length > 0 ? `${name} has taken ${taken.map(kindName).join(', ')}` : `${name} has taken nothing yet`}
        role="img"
      >
        {taken.map((kind, index) => (
          <PieceGlyph key={index} piece={{ side: otherSide(side), kind }} set={pieces} className="-mx-0.5 size-5" />
        ))}
        {lead?.side === side && <span className="ml-1 text-sm font-bold text-ink-soft tabular-nums">+{lead.amount}</span>}
      </span>
    </div>
  )
}
