import { useMemo } from 'react'
import type { GameCosmetics } from '@/games/types'
import { DEFAULT_OUTFIT, findSkin, type Outfit, type SkinSlot } from '../skins'

/**
 * What Pip and the obstacles look like (the world is not a skin: it follows the run): the skins the player wears (from the platform's
 * inventory), and the game's own look for any slot with none, or with one this version does not know.
 * Guests always get the game's own looks.
 */
export function useOutfit(cosmetics: GameCosmetics | undefined): Outfit {
  const skins = cosmetics?.skins
  return useMemo(() => {
    const worn = (slot: SkinSlot) => skins?.find((skin) => skin.slot === slot && skin.equipped)?.skinId ?? ''
    return {
      runner: findSkin('runner', worn('runner')) ?? DEFAULT_OUTFIT.runner,
      obstacles: findSkin('obstacles', worn('obstacles')) ?? DEFAULT_OUTFIT.obstacles,
    }
  }, [skins])
}
