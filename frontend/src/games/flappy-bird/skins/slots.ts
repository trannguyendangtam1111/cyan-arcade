import type { SkinSlot } from './skinTypes'

/**
 * What each slot is called. On its own so the game's module can name its slots for the shop
 * without pulling every skin into the arcade's main bundle.
 */
export const SLOT_LABELS: Record<SkinSlot, string> = { bird: 'Bird', pipes: 'Obstacles', sky: 'Sky' }
