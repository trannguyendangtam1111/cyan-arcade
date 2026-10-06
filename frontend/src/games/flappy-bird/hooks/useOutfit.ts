import { useMemo } from 'react'
import type { GameCosmetics } from '@/games/types'
import { DEFAULT_OUTFIT, findSkin, type Outfit, type SkinSlot } from '../skins'

/**
 * What the bird, the pipes and the sky look like: the skins the player wears (from the platform's
 * inventory), and the game's own looks for any slot with none, or with one this version does not
 * know. Guests always get the game's own looks.
 */
export function useOutfit(cosmetics: GameCosmetics | undefined): Outfit {
  const skins = cosmetics?.skins
  return useMemo(() => {
    const worn = (slot: SkinSlot) => skins?.find((skin) => skin.slot === slot && skin.equipped)?.skinId ?? ''
    return {
      bird: findSkin('bird', worn('bird')) ?? DEFAULT_OUTFIT.bird,
      pipes: findSkin('pipes', worn('pipes')) ?? DEFAULT_OUTFIT.pipes,
      sky: findSkin('sky', worn('sky')) ?? DEFAULT_OUTFIT.sky,
    }
  }, [skins])
}
