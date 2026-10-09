import { useMemo } from 'react'
import type { GameCosmetics } from '@/games/types'
import { DEFAULT_KEYBOARD, DEFAULT_TILES, findKeyboardTheme, findTileTheme, type KeyboardTheme, type TileTheme } from '../skins'

export interface Look {
  tiles: TileTheme
  keyboard: KeyboardTheme
}

/**
 * The tiles and keyboard the player wears (from the platform's inventory), or the game's own for a
 * slot with none, or with one this version does not know. Guests always get the game's own.
 */
export function useLook(cosmetics: GameCosmetics | undefined): Look {
  const skins = cosmetics?.skins
  return useMemo(() => {
    const worn = (slot: string) => skins?.find((skin) => skin.slot === slot && skin.equipped)?.skinId ?? ''
    return {
      tiles: findTileTheme(worn('tiles')) ?? DEFAULT_TILES,
      keyboard: findKeyboardTheme(worn('keyboard')) ?? DEFAULT_KEYBOARD,
    }
  }, [skins])
}
