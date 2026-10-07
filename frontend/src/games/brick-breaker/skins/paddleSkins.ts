import type { PaddleSkin } from './skinTypes'

/**
 * Every paddle, in pixel art. Original designs; the ids of the shop's paddles match their shop
 * items' icons. Every one is drawn inside the same rectangle, the one the ball bounces off.
 */
export const PADDLE_SKINS: readonly PaddleSkin[] = [
  {
    id: 'cyan',
    name: 'Cyan Default',
    category: 'default',
    rarity: 'common',
    description: "The arcade's own paddle, with a happy little face. Free for everyone.",
    unlock: { kind: 'free' },
    look: { body: '#22d3ee', shade: '#0e7490', rim: '#cffafe', outline: '#083344', pattern: 'face', patternColor: '#f9a8d4' },
  },
  {
    id: 'candy',
    name: 'Candy Paddle',
    category: 'cute',
    rarity: 'common',
    description: 'A stick of striped candy.',
    unlock: { kind: 'shop' },
    look: { body: '#fb7185', shade: '#be123c', rim: '#ffe4e6', outline: '#4c0519', pattern: 'candy', patternColor: '#ffffff' },
  },
  {
    id: 'neon',
    name: 'Neon Paddle',
    category: 'scifi',
    rarity: 'rare',
    description: 'A bar of humming pink light.',
    unlock: { kind: 'shop' },
    look: { body: '#2e1065', shade: '#1e0a45', rim: '#f5d0fe', outline: '#f0abfc', pattern: 'neon', patternColor: '#f472b6', glow: '#e879f9' },
  },
  {
    id: 'sakura',
    name: 'Sakura Paddle',
    category: 'anime',
    rarity: 'rare',
    description: 'A lacquered branch in full blossom.',
    unlock: { kind: 'shop' },
    look: { body: '#7f1d45', shade: '#500724', rim: '#fbcfe8', outline: '#2a0414', pattern: 'blossom', patternColor: '#f9a8d4' },
  },
  {
    id: 'galaxy',
    name: 'Galaxy Paddle',
    category: 'space',
    rarity: 'epic',
    description: 'A slice of the night sky, stars included.',
    unlock: { kind: 'shop' },
    look: { body: '#312e81', shade: '#1e1b4b', rim: '#a5b4fc', outline: '#0b0a2a', pattern: 'stars', patternColor: '#fef9c3', glow: '#818cf8' },
  },
  {
    id: 'dragon',
    name: 'Dragon Paddle',
    category: 'fantasy',
    rarity: 'legendary',
    description: 'Green scales and a golden edge.',
    unlock: { kind: 'shop' },
    look: { body: '#15803d', shade: '#14532d', rim: '#facc15', outline: '#052e16', pattern: 'scales', patternColor: '#86efac' },
  },
  {
    id: 'cyber',
    name: 'Cyber Paddle',
    category: 'scifi',
    rarity: 'epic',
    description: 'Dark steel with cyan circuitry.',
    unlock: { kind: 'shop' },
    look: { body: '#1e293b', shade: '#0f172a', rim: '#67e8f9', outline: '#22d3ee', pattern: 'circuit', patternColor: '#22d3ee', glow: '#22d3ee' },
  },
  {
    id: 'mochi',
    name: 'Mochi Paddle',
    category: 'cute',
    rarity: 'common',
    description: 'Soft and squishy, in three flavours.',
    unlock: { kind: 'shop' },
    look: { body: '#fdf2f8', shade: '#f5d0e6', rim: '#ffffff', outline: '#7e22ce', pattern: 'mochi', patternColor: '#bbf7d0' },
  },
]
