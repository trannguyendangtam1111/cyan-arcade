import { Play } from 'lucide-react'
import { Link } from 'react-router'
import { cardStyles, interactiveCard } from '@/components/ui/cardStyles'
import { categoryLabels } from '@/games/registry'
import type { GameDefinition } from '@/games/types'
import { accentStyle } from '@/lib/accent'
import { cn } from '@/lib/cn'

/** Compact links back to the games played most recently on this device. */
export function JumpBackIn({ games }: { games: GameDefinition[] }) {
  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {games.map((game) => (
        <li key={game.slug} className="flex *:w-full">
          <Link
            to={`/games/${game.slug}`}
            style={accentStyle(game.accentColor)}
            className={cardStyles('none', cn('group flex items-center gap-4 p-3 pr-5', interactiveCard))}
          >
            <img
              src={game.thumbnail}
              alt=""
              loading="lazy"
              className="size-16 shrink-0 rounded-2xl bg-(--accent) object-cover"
            />
            <span className="min-w-0">
              <span className="block truncate font-display text-lg font-semibold">{game.name}</span>
              <span className="text-sm text-ink-soft">{categoryLabels[game.category]}</span>
            </span>
            <span
              aria-hidden
              className="ml-auto grid size-10 shrink-0 place-items-center rounded-full bg-(--accent) text-(--accent-ink) transition-transform group-hover:scale-110"
            >
              <Play className="size-4" fill="currentColor" />
            </span>
          </Link>
        </li>
      ))}
    </ul>
  )
}
