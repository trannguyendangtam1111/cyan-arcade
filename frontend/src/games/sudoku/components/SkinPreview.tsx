import { cn } from '@/lib/cn'
import { DEFAULT_BOARD, DEFAULT_PAD, findBoardTheme, findPadTheme, isSkinSlot } from '../skins'

/** Square, sized by the height the host gives it, so it fits a shop card, the inventory and the picker. */
const SQUARE = 'grid aspect-square shrink-0 grid-cols-3 grid-rows-3 overflow-hidden'

/** A corner of a board: clues, a digit, a selected cell, notes. */
const SAMPLE = ['5', '', '3', '', '7', '', '1', '', '9']

interface SkinPreviewProps {
  slot: string
  skinId: string
  className?: string
}

/**
 * A small picture of a board theme (a 3×3 box) or a number-pad theme (a few keys), drawn from the same
 * colours as the game. An unknown skin shows the slot's own look; an unknown slot shows nothing.
 */
export function SkinPreview({ slot, skinId, className }: SkinPreviewProps) {
  if (!isSkinSlot(slot)) return null

  if (slot === 'board') {
    const theme = findBoardTheme(skinId) ?? DEFAULT_BOARD
    return (
      <div aria-hidden className={cn(SQUARE, 'rounded-lg border-2', className ?? 'h-16')} style={{ background: theme.line, borderColor: theme.frame, gap: 1 }}>
        {SAMPLE.map((digit, index) => (
          <span
            key={index}
            className="grid min-h-0 min-w-0 place-items-center font-display text-[0.7rem] leading-none font-bold"
            style={{
              background: index === 4 ? theme.selected : index === 1 || index === 7 ? theme.related : theme.cell,
              color: index === 4 ? theme.selectedInk : index === 6 ? theme.entry : theme.given,
            }}
          >
            {digit}
          </span>
        ))}
      </div>
    )
  }

  const theme = findPadTheme(skinId) ?? DEFAULT_PAD
  return (
    <div aria-hidden className={cn('grid aspect-square shrink-0 grid-cols-2 grid-rows-2 gap-[10%] rounded-lg bg-white p-[10%]', className ?? 'h-16')}>
      {['1', '2', '3', '4'].map((digit, index) => (
        <span
          key={digit}
          className="grid min-h-0 min-w-0 place-items-center border font-display text-[0.7rem] leading-none font-semibold"
          style={{
            background: index === 0 ? theme.active : theme.key,
            color: index === 0 ? theme.activeInk : theme.ink,
            borderColor: theme.border,
            borderRadius: `calc(${theme.radius} * 0.45)`,
          }}
        >
          {digit}
        </span>
      ))}
    </div>
  )
}

/** The module's `cosmetics.Preview`, loaded lazily by the shop. */
export default SkinPreview
