import { Gamepad2, Sparkles } from 'lucide-react'
import { Suspense } from 'react'
import { Badge } from '@/components/ui/Badge'
import { findGameModule } from '@/games/registry'
import { useGameCatalog } from '@/hooks/useGameCatalog'

/** What the shop knows about a game skin: which game, which slot, which look. */
interface SkinItem {
  gameSlug: string | null
  slot: string | null
  icon: string
}

/**
 * A game skin's picture, drawn by its game (the module's `cosmetics.Preview`, downloaded only when
 * a skin is shown). A skin of a game this app does not have shows a sparkle instead.
 */
export function GameSkinPreview({ item, className }: { item: SkinItem; className?: string }) {
  const Preview = item.gameSlug ? findGameModule(item.gameSlug)?.cosmetics?.Preview : undefined
  const fallback = <Sparkles aria-hidden className="size-7" />
  if (!Preview || !item.slot) return fallback
  return (
    <Suspense fallback={fallback}>
      <Preview slot={item.slot} skinId={item.icon} className={className} />
    </Suspense>
  )
}

/** Which game a skin is for and what it dresses, e.g. "Flappy Bird · Bird". */
export function GameSkinBadge({ item }: { item: SkinItem }) {
  const { games } = useGameCatalog()
  const game = games?.find((candidate) => candidate.slug === item.gameSlug)
  const slot = item.slot ? findGameModule(item.gameSlug ?? '')?.cosmetics?.slots[item.slot] : undefined
  const label = [game?.name, slot].filter(Boolean).join(' · ')
  if (!label) return null
  return (
    <Badge tone="neutral">
      <Gamepad2 aria-hidden className="size-3.5" />
      {label}
    </Badge>
  )
}
