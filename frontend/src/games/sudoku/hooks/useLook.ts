import { useMemo } from 'react'
import type { GameCosmetics } from '@/games/types'
import { DEFAULT_BOARD, DEFAULT_PAD, findBoardTheme, findPadTheme, type BoardTheme, type PadTheme } from '../skins'

export interface Look {
  board: BoardTheme
  pad: PadTheme
}

/**
 * The board and pad the player wears (from the platform's inventory), or the game's own for a slot
 * with none, or with one this version does not know. Guests always get the game's own.
 */
export function useLook(cosmetics: GameCosmetics | undefined): Look {
  const skins = cosmetics?.skins
  return useMemo(() => {
    const worn = (slot: string) => skins?.find((skin) => skin.slot === slot && skin.equipped)?.skinId ?? ''
    return { board: findBoardTheme(worn('board')) ?? DEFAULT_BOARD, pad: findPadTheme(worn('pad')) ?? DEFAULT_PAD }
  }, [skins])
}
