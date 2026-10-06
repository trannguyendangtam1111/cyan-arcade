import { useQuery } from '@tanstack/react-query'
import { checkAiAccess } from '@/api/admin'
import { isAdmin, useSession, userKeys } from '@/api/auth'
import type { GameModule } from '@/games/types'

/**
 * A game's AI, for the players allowed to use AI mode: admins. Everyone else gets `undefined`, and
 * the game is played by a human only.
 *
 * The session's role decides whether to try; the server decides whether to succeed. The AI is
 * downloaded only after `GET /api/ai/access` has said yes for this very session, and in production
 * nginx serves the AI's code to that same check, so a player cannot fetch it by its address either.
 */
export function useGameAi(gameModule: GameModule): (() => unknown) | undefined {
  const { user } = useSession()
  const { loadAi } = gameModule
  const allowed = isAdmin(user) && loadAi !== undefined

  const { data } = useQuery({
    // Under the player's own keys, so signing out forgets it.
    queryKey: [...userKeys.all, 'ai', gameModule.slug],
    queryFn: async ({ signal }) => {
      if (!loadAi) throw new Error(`${gameModule.slug} has no AI`)
      await checkAiAccess(signal)
      // Kept in an object: the query cache would treat a bare function as an updater.
      return { create: await loadAi() }
    },
    enabled: allowed,
    staleTime: Infinity,
    retry: false,
  })
  return allowed ? data?.create : undefined
}
