import { useMemo } from 'react'
import type { GameCosmetics } from '@/games/types'
import { DEFAULT_BOARD, DEFAULT_PIECES, findBoardTheme, findPieceSet, type BoardTheme, type PieceSet } from '../skins'

export interface Look {
  board: BoardTheme
  pieces: PieceSet
}

/**
 * The board and pieces the player wears (from the platform's inventory), or the game's own for a
 * slot with none, or with one this version does not know. Guests always get the game's own.
 */
export function useLook(cosmetics: GameCosmetics | undefined): Look {
  const skins = cosmetics?.skins
  return useMemo(() => {
    const worn = (slot: string) => skins?.find((skin) => skin.slot === slot && skin.equipped)?.skinId ?? ''
    return { board: findBoardTheme(worn('board')) ?? DEFAULT_BOARD, pieces: findPieceSet(worn('pieces')) ?? DEFAULT_PIECES }
  }, [skins])
}
