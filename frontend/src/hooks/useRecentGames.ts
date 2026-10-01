import { useMemo, useState } from 'react'
import type { GameDefinition } from '@/games/types'
import { getRecentGameSlugs } from '@/lib/recentGames'
import { useGameCatalog } from './useGameCatalog'

/**
 * The games played most recently on this device that are still in the catalog, newest first.
 * Empty while the catalog loads, and for someone who has not played here yet.
 */
export function useRecentGames(limit = 3): GameDefinition[] {
  const { games } = useGameCatalog()
  // Read once per visit to the page: the list only changes by playing, which happens elsewhere.
  const [slugs] = useState(getRecentGameSlugs)

  return useMemo(() => {
    if (!games) return []
    return slugs
      .map((slug) => games.find((game) => game.slug === slug))
      .filter((game): game is GameDefinition => game !== undefined)
      .slice(0, limit)
  }, [games, slugs, limit])
}
