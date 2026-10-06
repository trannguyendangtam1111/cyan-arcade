import { BIRD_SKINS } from './birdSkins'
import { PIPE_SKINS } from './pipeSkins'
import { SKY_THEMES } from './skyThemes'
import type { Outfit, SkinCategory, SkinRarity, SkinsBySlot, SkinSlot } from './skinTypes'

export { SLOT_LABELS } from './slots'

/**
 * The cosmetic registry: every look the game can draw, by slot. Rendering looks a skin up here and
 * draws it; nothing else in the game branches on which skin is worn.
 */
export const SKINS: { readonly [Slot in SkinSlot]: readonly SkinsBySlot[Slot][] } = {
  bird: BIRD_SKINS,
  pipes: PIPE_SKINS,
  sky: SKY_THEMES,
}

export const SKIN_SLOTS: readonly SkinSlot[] = ['bird', 'pipes', 'sky']

export const CATEGORY_LABELS: Record<SkinCategory, string> = {
  default: 'Default',
  cute: 'Cute',
  anime: 'Anime style',
  fantasy: 'Fantasy',
  fun: 'Just for fun',
  scifi: 'Sci-fi',
}

export const RARITY_LABELS: Record<SkinRarity, string> = {
  common: 'Common',
  rare: 'Rare',
  epic: 'Epic',
  legendary: 'Legendary',
}

/** The game's own looks, free for everyone and worn when nothing else is. */
export const DEFAULT_OUTFIT: Outfit = { bird: BIRD_SKINS[0], pipes: PIPE_SKINS[0], sky: SKY_THEMES[0] }

export function isSkinSlot(slot: string): slot is SkinSlot {
  return (SKIN_SLOTS as readonly string[]).includes(slot)
}

/** A look by slot and id, or `undefined` for one this version of the game does not have. */
export function findSkin<Slot extends SkinSlot>(slot: Slot, id: string): SkinsBySlot[Slot] | undefined {
  return (SKINS[slot] as readonly SkinsBySlot[Slot][]).find((skin) => skin.id === id)
}

export type { Outfit, SkinSlot } from './skinTypes'
