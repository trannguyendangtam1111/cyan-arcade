import { accentStyle } from '@/lib/accent'

/** The card game purple, for the card hub itself and for games without a color of their own. */
export const TCG_PURPLE = '#9333ea'

/**
 * A card game's own color for everything inside an element: `--accent` and the `--accent-ink` that
 * reads on it. The arcade stays cyan; a game's pages, buttons and packs take the game's color.
 */
export function gameAccent(color: string | null | undefined) {
  return accentStyle(color ?? TCG_PURPLE)
}
