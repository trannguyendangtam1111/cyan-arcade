import type { BallSkin } from './skinTypes'

/**
 * Every ball, in pixel art. Original designs; the ids of the shop's balls match their shop items'
 * icons. A skin never looks like the Fireball power-up's flames: those always show on top, whatever
 * is worn. Every ball is drawn inside the circle the engine bounces.
 */
export const BALL_SKINS: readonly BallSkin[] = [
  {
    id: 'cyan',
    name: 'Cyan Orb',
    category: 'default',
    rarity: 'common',
    description: "The arcade's own ball. Free for everyone.",
    unlock: { kind: 'free' },
    look: { core: '#ecfeff', rim: '#0e7490', highlight: '#ffffff', trail: '#67e8f9', pattern: 'shine' },
  },
  {
    id: 'fire',
    name: 'Ember Ball',
    category: 'fantasy',
    rarity: 'rare',
    description: 'A glowing coal that leaves sparks behind.',
    unlock: { kind: 'shop' },
    look: { core: '#fdba74', rim: '#9a3412', highlight: '#fff7ed', trail: '#fb923c', pattern: 'ember', glow: '#fb923c' },
  },
  {
    id: 'ice',
    name: 'Ice Ball',
    category: 'fantasy',
    rarity: 'rare',
    description: 'A frosty marble that never melts.',
    unlock: { kind: 'shop' },
    look: { core: '#bae6fd', rim: '#075985', highlight: '#ffffff', trail: '#bae6fd', pattern: 'frost', glow: '#bae6fd' },
  },
  {
    id: 'plasma',
    name: 'Plasma Ball',
    category: 'scifi',
    rarity: 'epic',
    description: 'Crackling purple energy in a bottle.',
    unlock: { kind: 'shop' },
    look: { core: '#c026d3', rim: '#4a044e', highlight: '#fdf4ff', trail: '#e879f9', pattern: 'plasma', glow: '#e879f9' },
  },
  {
    id: 'star',
    name: 'Star Ball',
    category: 'anime',
    rarity: 'rare',
    description: 'A lucky little star.',
    unlock: { kind: 'shop' },
    look: { core: '#fde047', rim: '#a16207', highlight: '#ffffff', trail: '#fde047', pattern: 'star', glow: '#fde047' },
  },
  {
    id: 'bubble',
    name: 'Bubble Ball',
    category: 'cute',
    rarity: 'common',
    description: 'A bubble that refuses to pop.',
    unlock: { kind: 'shop' },
    look: { core: '#e0f2fe', rim: '#0369a1', highlight: '#ffffff', trail: '#bae6fd', pattern: 'bubble' },
  },
  {
    id: 'galaxy',
    name: 'Galaxy Ball',
    category: 'space',
    rarity: 'legendary',
    description: 'A whole galaxy, spinning on the spot.',
    unlock: { kind: 'shop' },
    look: { core: '#3730a3', rim: '#c7d2fe', highlight: '#f5f3ff', trail: '#818cf8', pattern: 'galaxy', glow: '#a5b4fc' },
  },
]
