import { useMemo } from 'react'
import type { GameCosmetics } from '@/games/types'
import { DEFAULT_OUTFIT, findSkin, type Outfit, type SkinSlot } from '../skins'

/**
 * What the paddle, the ball and the bricks look like: the skins the player wears (from the
 * platform's inventory), and the game's own looks for any slot with none, or with one this version
 * does not know. Guests always get the game's own looks.
 */
export function useOutfit(cosmetics: GameCosmetics | undefined): Outfit {
  const skins = cosmetics?.skins
  return useMemo(() => {
    const worn = (slot: SkinSlot) => skins?.find((skin) => skin.slot === slot && skin.equipped)?.skinId ?? ''
    return {
      paddle: findSkin('paddle', worn('paddle')) ?? DEFAULT_OUTFIT.paddle,
      ball: findSkin('ball', worn('ball')) ?? DEFAULT_OUTFIT.ball,
      bricks: findSkin('bricks', worn('bricks')) ?? DEFAULT_OUTFIT.bricks,
    }
  }, [skins])
}
