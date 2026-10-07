import type { BrickTheme } from './skinTypes'

/**
 * Every brick theme. A theme is one of the game's pixel worlds (see `render/worlds.ts`): the
 * arcade's own, free one follows the levels, a world for each; a theme from the shop keeps its own
 * world on every level. Toughness never depends on colour alone: tough bricks have a double frame,
 * armored ones rivets, special ones a star, and cracks show damage, in every world.
 */
export const BRICK_THEMES: readonly BrickTheme[] = [
  {
    id: 'classic',
    name: 'Arcade Worlds',
    category: 'default',
    rarity: 'common',
    description: 'Every level in its own pixel world, from Cute Sakura to Dark Moon. Free for everyone.',
    unlock: { kind: 'free' },
    look: { world: 'levels' },
  },
  {
    id: 'candy',
    name: 'Candy Bricks',
    category: 'cute',
    rarity: 'common',
    description: 'Wrapped sweets in a sugar-pink arena.',
    unlock: { kind: 'shop' },
    look: { world: 'candy' },
  },
  {
    id: 'neon',
    name: 'Neon Bricks',
    category: 'scifi',
    rarity: 'rare',
    description: 'Glowing tubes in a dark city night.',
    unlock: { kind: 'shop' },
    look: { world: 'cyber' },
  },
  {
    id: 'sakura',
    name: 'Sakura Bricks',
    category: 'anime',
    rarity: 'rare',
    description: 'Blossom tiles under a spring sky.',
    unlock: { kind: 'shop' },
    look: { world: 'sakura' },
  },
  {
    id: 'space',
    name: 'Space Bricks',
    category: 'space',
    rarity: 'epic',
    description: 'Planets and moonrock among the stars.',
    unlock: { kind: 'shop' },
    look: { world: 'galaxy' },
  },
  {
    id: 'fantasy',
    name: 'Fantasy Bricks',
    category: 'fantasy',
    rarity: 'legendary',
    description: 'Castle stone, emeralds and gold in a misty keep.',
    unlock: { kind: 'shop' },
    look: { world: 'dragon' },
  },
]
