import { cn } from '@/lib/cn'
import { DEFAULT_BOARD, DEFAULT_PIECES, findBoardTheme, findPieceSet, isSkinSlot } from '../skins'
import { PieceGlyph } from './PieceGlyph'

interface SkinPreviewProps {
  slot: string
  skinId: string
  className?: string
}

/**
 * A small picture of a board theme (a 2 × 2 corner with a knight) or a piece set (a white and a
 * black piece), drawn from the same colours as the game. An unknown skin shows the slot's own look;
 * an unknown slot shows nothing.
 */
export function SkinPreview({ slot, skinId, className }: SkinPreviewProps) {
  if (!isSkinSlot(slot)) return null

  if (slot === 'board') {
    const theme = findBoardTheme(skinId) ?? DEFAULT_BOARD
    return (
      <div
        aria-hidden
        className={cn('grid aspect-square shrink-0 grid-cols-2 grid-rows-2 overflow-hidden rounded-lg border-2', className ?? 'h-16')}
        style={{ borderColor: theme.frame }}
      >
        {[theme.light, theme.dark, theme.dark, theme.light].map((colour, index) => (
          <span key={index} className="relative min-h-0 min-w-0" style={{ background: colour }}>
            {index === 1 && <PieceGlyph piece={{ side: 'BLACK', kind: 'n' }} set={DEFAULT_PIECES} halo={theme.halo} className="absolute inset-0 size-full" />}
            {index === 2 && <PieceGlyph piece={{ side: 'WHITE', kind: 'n' }} set={DEFAULT_PIECES} halo={theme.halo} className="absolute inset-0 size-full" />}
          </span>
        ))}
      </div>
    )
  }

  const set = findPieceSet(skinId) ?? DEFAULT_PIECES
  return (
    <div
      aria-hidden
      className={cn('flex aspect-square shrink-0 items-end justify-center rounded-lg p-[6%]', className ?? 'h-16')}
      style={{ background: `linear-gradient(135deg, ${DEFAULT_BOARD.light} 50%, ${DEFAULT_BOARD.dark} 50%)` }}
    >
      <PieceGlyph piece={{ side: 'WHITE', kind: 'q' }} set={set} halo={DEFAULT_BOARD.halo} className="size-1/2" />
      <PieceGlyph piece={{ side: 'BLACK', kind: 'k' }} set={set} halo={DEFAULT_BOARD.halo} className="size-1/2" />
    </div>
  )
}

/** The module's `cosmetics.Preview`, loaded lazily by the shop. */
export default SkinPreview
