import { Sparkles } from 'lucide-react'
import type { CSSProperties, ReactNode } from 'react'
import { EmptyState } from '@/components/ui/EmptyState'
import { ErrorState } from '@/components/ui/ErrorState'
import type { GameDefinition } from '@/games/types'
import { useGameCatalog } from '@/hooks/useGameCatalog'
import { GameCard, GameCardSkeleton } from './GameCard'

interface GameGridProps {
  /** Picks which games to show from the whole catalog (featured ones, one category). All when omitted. */
  select?: (games: GameDefinition[]) => GameDefinition[]
  /** How many placeholder cards to show while the catalog loads. */
  skeletonCount?: number
  /** Shown when the catalog has games but the selection is empty. */
  emptySelection?: ReactNode
}

/** Games from the catalog as a responsive grid, including the loading, error and empty states. */
export function GameGrid({ select, skeletonCount = 3, emptySelection = null }: GameGridProps) {
  const { games, isPending, isError, refetch } = useGameCatalog()

  if (isPending) {
    return (
      <div role="status" aria-label="Loading games" className={gridStyles}>
        {Array.from({ length: skeletonCount }, (_, index) => (
          <GameCardSkeleton key={index} />
        ))}
      </div>
    )
  }

  if (isError || !games) {
    return <ErrorState title="Couldn't load the games" onRetry={() => void refetch()} />
  }

  if (games.length === 0) {
    return (
      <EmptyState
        icon={Sparkles}
        title="The arcade is warming up"
        description="The first cabinets are being wheeled in. Check back soon!"
      />
    )
  }

  const shown = select ? select(games) : games
  if (shown.length === 0) return emptySelection

  return (
    <ul className={gridStyles}>
      {shown.map((game, index) => (
        // Cards arrive one after the other rather than all at once.
        <li key={game.slug} className="flex *:w-full" style={{ '--pop-delay': `${index * 60}ms` } as CSSProperties}>
          <GameCard game={game} />
        </li>
      ))}
    </ul>
  )
}

const gridStyles = 'grid gap-5 sm:grid-cols-2 lg:grid-cols-3'
