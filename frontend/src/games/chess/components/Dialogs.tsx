import { Flag } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { kindName, PROMOTION_PIECES, sideName } from '../engine/board'
import type { PieceSet } from '../skins'
import type { PromotionPiece, Side } from '../types/chessTypes'
import { PieceGlyph } from './PieceGlyph'

/** What a pawn reaching the last rank becomes. Closing it puts the pawn back. */
export function PromotionDialog({
  side,
  pieces,
  onChoose,
}: {
  side: Side | null
  pieces: PieceSet
  onChoose: (piece: PromotionPiece | null) => void
}) {
  return (
    <Modal open={side !== null} onClose={() => onChoose(null)} title="Promote your pawn">
      <p className="text-ink-soft">Choose what {side ? sideName(side) : ''}'s pawn becomes.</p>
      <div role="group" aria-label="Promotion choices" className="grid grid-cols-4 gap-2">
        {PROMOTION_PIECES.map((kind) => (
          <button
            key={kind}
            type="button"
            onClick={() => onChoose(kind)}
            className="flex flex-col items-center gap-1 rounded-control bg-surface-muted p-2 font-bold ring-2 ring-transparent transition hover:ring-(--accent) focus-visible:ring-(--accent) focus-visible:outline-none"
          >
            {side && <PieceGlyph piece={{ side, kind }} set={pieces} halo="#ffffff" className="size-14" />}
            <span className="text-sm capitalize">{kindName(kind)}</span>
          </button>
        ))}
      </div>
    </Modal>
  )
}

/** Resigning ends the game at once, so it is confirmed, and says which side gives up. */
export function ResignDialog({
  open,
  turn,
  only,
  onResign,
  onClose,
}: {
  open: boolean
  turn: Side
  /** The one side that may resign (the player's, against Stockfish); both when left out. */
  only?: Side
  onResign: (side: Side) => void
  onClose: () => void
}) {
  const other: Side = turn === 'WHITE' ? 'BLACK' : 'WHITE'
  const sides: Side[] = only ? [only] : [turn, other]
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Resign the game?"
      footer={
        <Button variant="secondary" onClick={onClose}>
          Keep playing
        </Button>
      }
    >
      <p className="text-ink-soft">The side that resigns loses at once. This cannot be taken back.</p>
      <div className={only ? 'grid gap-2' : 'grid gap-2 sm:grid-cols-2'}>
        {sides.map((side) => (
          <Button key={side} variant={side === turn || only ? 'primary' : 'secondary'} onClick={() => onResign(side)}>
            <Flag aria-hidden className="size-4" />
            {sideName(side)} resigns
          </Button>
        ))}
      </div>
    </Modal>
  )
}

/** Starting over leaves the game in progress, so it is confirmed. */
export function NewGameDialog({ open, onConfirm, onClose }: { open: boolean; onConfirm: () => void; onClose: () => void }) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Start a new game?"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Keep playing
          </Button>
          <Button onClick={onConfirm}>New game</Button>
        </>
      }
    >
      <p className="text-ink-soft">The game in progress will be left unfinished.</p>
    </Modal>
  )
}
