import { useMemo } from 'react'
import { useGame, useGames } from '@/api/games'
import { toGameDefinition } from '@/games/registry'

/** The full hub catalog: backend entries joined with their registered frontend modules. */
export function useGameCatalog() {
  const query = useGames()
  const games = useMemo(() => query.data?.map(toGameDefinition), [query.data])
  return { ...query, games }
}

/** One game by slug. `error.status === 404` means the game does not exist (or is inactive). */
export function useGameDefinition(slug: string) {
  const query = useGame(slug)
  const game = useMemo(() => (query.data ? toGameDefinition(query.data) : undefined), [query.data])
  return { ...query, game }
}
