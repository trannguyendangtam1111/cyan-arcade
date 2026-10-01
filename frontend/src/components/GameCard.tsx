import { Clock, Play } from 'lucide-react'
import { Link } from 'react-router'
import { Badge } from '@/components/ui/Badge'
import { cardStyles, interactiveCard } from '@/components/ui/cardStyles'
import { categoryLabels } from '@/games/registry'
import type { GameDefinition } from '@/games/types'
import { accentStyle } from '@/lib/accent'
import { cn } from '@/lib/cn'

/** Catalog tile. The game's accent color is scoped to the card via the `--accent` variable. */
export function GameCard({ game }: { game: GameDefinition }) {
  const playable = game.module !== undefined

  return (
    <Link
      to={`/games/${game.slug}`}
      style={accentStyle(game.accentColor)}
      className={cardStyles(
        'none',
        cn(
          // A grid can stagger its cards by setting --pop-delay on each one.
          'group flex flex-col overflow-hidden [animation-delay:var(--pop-delay,0ms)] motion-safe:animate-pop-in',
          interactiveCard,
        ),
      )}
    >
      <div className="relative aspect-5/3 overflow-hidden bg-(--accent)">
        <img
          src={game.thumbnail}
          alt=""
          loading="lazy"
          className="size-full object-cover transition-transform duration-300 group-hover:scale-105"
        />
        <Badge tone="neutral" className="absolute top-3 left-3 bg-surface/90 text-ink shadow-soft">
          {categoryLabels[game.category]}
        </Badge>
      </div>

      <div className="flex flex-1 flex-col gap-3 p-5">
        <h3 className="text-xl font-semibold">{game.name}</h3>
        <p className="line-clamp-2 text-ink-soft">{game.description}</p>
        <div className="mt-auto pt-1">
          {playable ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-(--accent) px-3.5 py-1.5 font-display text-sm font-semibold text-(--accent-ink) transition-transform group-hover:scale-105">
              <Play aria-hidden className="size-3.5" fill="currentColor" />
              Play
            </span>
          ) : (
            <Badge tone="accent" className="px-3 py-1 text-sm">
              <Clock aria-hidden className="size-3.5" />
              Coming soon
            </Badge>
          )}
        </div>
      </div>
    </Link>
  )
}

/** Same footprint as a GameCard, shown while the catalog loads. */
export function GameCardSkeleton() {
  return (
    <div aria-hidden className={cardStyles('none', 'overflow-hidden')}>
      <div className="aspect-5/3 animate-pulse bg-surface-muted" />
      <div className="flex flex-col gap-3 p-5">
        <div className="h-6 w-2/5 animate-pulse rounded-full bg-surface-muted" />
        <div className="h-4 w-full animate-pulse rounded-full bg-surface-muted" />
        <div className="h-4 w-3/4 animate-pulse rounded-full bg-surface-muted" />
        <div className="mt-1 h-7 w-28 animate-pulse rounded-full bg-surface-muted" />
      </div>
    </div>
  )
}
