import { cn } from '@/lib/cn'
import type { TileState } from '../engine/board'
import { DEFAULT_KEYBOARD, DEFAULT_TILES, findKeyboardTheme, findTileTheme, isSkinSlot, paintStyle } from '../skins'

const SAMPLE: { letter: string; state: TileState }[] = [
  { letter: 'C', state: 'correct' },
  { letter: 'U', state: 'present' },
  { letter: 'T', state: 'absent' },
  { letter: 'E', state: 'filled' },
]

/** Square, sized by the height the host gives it, so it fits a shop card, the inventory and the picker. */
const SQUARE = 'grid aspect-square shrink-0 grid-cols-2 grid-rows-2 gap-[8%] rounded-lg p-[9%]'

interface SkinPreviewProps {
  slot: string
  skinId: string
  className?: string
}

/**
 * A small square picture of a tile set (four tiles, one of each kind) or a keyboard theme (four keys),
 * drawn from the same colours as the game. An unknown skin shows the slot's own look; an unknown
 * slot shows nothing.
 */
export function SkinPreview({ slot, skinId, className }: SkinPreviewProps) {
  if (!isSkinSlot(slot)) return null

  if (slot === 'tiles') {
    const theme = findTileTheme(skinId) ?? DEFAULT_TILES
    return (
      <div aria-hidden className={cn(SQUARE, className ?? 'h-16')} style={{ background: theme.backdrop }}>
        {SAMPLE.map(({ letter, state }) => (
          <span
            key={letter}
            style={{ ...paintStyle(theme.tiles[state]), borderRadius: `calc(${theme.radius} * 0.45)` }}
            className="grid min-h-0 min-w-0 place-items-center border-2 font-display text-[0.7rem] leading-none font-bold"
          >
            {letter}
          </span>
        ))}
      </div>
    )
  }

  const theme = findKeyboardTheme(skinId) ?? DEFAULT_KEYBOARD
  return (
    <div aria-hidden className={cn(SQUARE, className ?? 'h-16')} style={{ background: theme.tray === 'transparent' ? '#ffffff' : theme.tray }}>
      {['Q', 'W', 'A', 'S'].map((letter) => (
        <span
          key={letter}
          style={{ ...paintStyle(theme.key), borderRadius: `calc(${theme.radius} * 0.45)` }}
          className="grid min-h-0 min-w-0 place-items-center border font-display text-[0.7rem] leading-none font-semibold"
        >
          {letter}
        </span>
      ))}
    </div>
  )
}

/** The module's `cosmetics.Preview`, loaded lazily by the shop. */
export default SkinPreview
