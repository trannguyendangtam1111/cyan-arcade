import { cn } from '@/lib/cn'
import type { Rarity } from '../api'
import { tierStyle } from '../rarity'

/** A rarity by the name its own game gives it, colored by tier. */
export function RarityBadge({ rarity, className }: { rarity: Rarity; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold tracking-wide whitespace-nowrap',
        tierStyle(rarity.tier).badge,
        className,
      )}
    >
      {rarity.name}
    </span>
  )
}
