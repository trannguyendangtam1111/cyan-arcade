import { cn } from '@/lib/cn'
import { PREVIEW_COUNT, pieceCells } from '../engine/tetrisEngine'
import type { PieceType } from '../types/tetrisTypes'
import { BLOCK, PIECE_COLORS } from './pieceStyles'

/** The upcoming pieces, next one on top. */
export function NextPieces({ queue }: { queue: readonly PieceType[] }) {
  return (
    <div className="flex w-16 flex-col items-center gap-3 rounded-control bg-surface-muted px-2 py-3">
      <p className="text-xs font-bold tracking-wide text-ink-soft uppercase">Next</p>
      {queue.slice(0, PREVIEW_COUNT).map((type, index) => (
        <PiecePreview key={index} type={type} />
      ))}
    </div>
  )
}

/** A small picture of one piece in its spawn orientation. */
function PiecePreview({ type }: { type: PieceType }) {
  const cells = pieceCells({ type, rotation: 0, x: 0, y: 0 })
  const top = Math.min(...cells.map(({ y }) => y))
  const width = Math.max(...cells.map(({ x }) => x)) + 1
  const filled = new Set(cells.map(({ x, y }) => (y - top) * width + x))

  return (
    <div
      role="img"
      aria-label={`${type} piece`}
      className="grid gap-px"
      style={{ gridTemplateColumns: `repeat(${width}, 0.7rem)`, gridAutoRows: '0.7rem' }}
    >
      {Array.from({ length: width * 2 }, (_, index) => (
        <div key={index} className={filled.has(index) ? cn(BLOCK, PIECE_COLORS[type]) : undefined} />
      ))}
    </div>
  )
}
