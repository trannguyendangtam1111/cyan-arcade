import { SCENERY, type Ambient } from '@/games/shared/pixel/scenery'
import { HANDCRAFTED_LEVELS } from '../engine/levels'
import type { BrickThemeLook, WorldId } from '../skins/skinTypes'
import type { BrickKind } from '../types/brickTypes'

/**
 * Brick Breaker's pixel worlds: a cute, original, anime-flavoured arcade, one world a level. A world
 * is pictures only: its scenery, the sparkle drifting in it, and the colours of its bricks. Which
 * world is drawn depends on the level number and the theme worn, never on anything random, so it can
 * never change how a level plays.
 *
 * The scenery (painting and drifting sparkle) is the arcade's shared pixel scenery
 * (`games/shared/pixel/scenery.ts`); a world adds its bricks, debris and score band.
 */

type Ctx = CanvasRenderingContext2D

export { SCENE_COLUMNS, SCENE_ROWS } from '@/games/shared/pixel/scenery'

export interface BrickColours {
  fill: string
  shade: string
  light: string
}

/** The little picture on a brick's face, the same on every brick of a world. */
export type Motif = 'blossom' | 'wrapper' | 'heart' | 'gem' | 'knot' | 'circuit' | 'scale' | 'crescent' | 'gloss'

/** What drifts in front of the scenery (shared with the other pixel games). */
export type { Ambient }

export interface World {
  /** Unique; sprites are cached under it. */
  id: string
  name: string
  /** Which scenery it shows (Endless's worlds share one). */
  scene: WorldId
  paint: (g: Ctx) => void
  ambient: { kind: Ambient; colours: readonly string[]; count: number }
  bricks: { [Kind in BrickKind]: BrickColours } & {
    outline: string
    motif: Motif
    /** Neon bricks are dark glass with glowing edges. */
    neon?: boolean
  }
  /** Pieces that fly when a brick breaks. */
  debris: readonly string[]
  /** The band behind the score, and its edge. */
  hud: { band: string; edge: string }
}

// --- The worlds ---------------------------------------------------------------------------------

const SAKURA: World = {
  id: 'sakura',
  name: SCENERY.sakura.name,
  scene: 'sakura',
  paint: SCENERY.sakura.paint,
  ambient: SCENERY.sakura.ambient,
  bricks: {
    normal: { fill: '#f472b6', shade: '#be185d', light: '#fce7f3' },
    tough: { fill: '#a78bfa', shade: '#6d28d9', light: '#ede9fe' },
    armored: { fill: '#d6d3d1', shade: '#78716c', light: '#fafaf9' },
    special: { fill: '#fde047', shade: '#ca8a04', light: '#fefce8' },
    outline: '#5b1035',
    motif: 'blossom',
  },
  debris: ['#f9a8d4', '#fbcfe8', '#ffffff', '#f472b6'],
  hud: { band: 'rgba(80,7,36,0.78)', edge: '#f9a8d4' },
}

const CANDY: World = {
  id: 'candy',
  name: SCENERY.candy.name,
  scene: 'candy',
  paint: SCENERY.candy.paint,
  ambient: SCENERY.candy.ambient,
  bricks: {
    normal: { fill: '#5eead4', shade: '#0f766e', light: '#eafaf2' },
    tough: { fill: '#f9a8d4', shade: '#db2777', light: '#fdf2f8' },
    armored: { fill: '#fdba74', shade: '#c2410c', light: '#fff7ed' },
    special: { fill: '#fde047', shade: '#ca8a04', light: '#fefce8' },
    outline: '#4a0d2e',
    motif: 'wrapper',
  },
  debris: ['#f472b6', '#5eead4', '#fde047', '#ffffff', '#c084fc'],
  hud: { band: 'rgba(74,13,46,0.78)', edge: '#5eead4' },
}

const CAFE: World = {
  id: 'cafe',
  name: SCENERY.cafe.name,
  scene: 'cafe',
  paint: SCENERY.cafe.paint,
  ambient: SCENERY.cafe.ambient,
  bricks: {
    normal: { fill: '#f5c992', shade: '#b45309', light: '#fff7ed' },
    tough: { fill: '#fda4af', shade: '#e11d48', light: '#fff1f2' },
    armored: { fill: '#a16a4a', shade: '#4a2617', light: '#e9c8a8' },
    special: { fill: '#fde047', shade: '#ca8a04', light: '#fefce8' },
    outline: '#2b140a',
    motif: 'heart',
  },
  debris: ['#f5c992', '#fda4af', '#ffffff', '#a16a4a'],
  hud: { band: 'rgba(43,20,10,0.8)', edge: '#f5c992' },
}

const GALAXY: World = {
  id: 'galaxy',
  name: SCENERY.galaxy.name,
  scene: 'galaxy',
  paint: SCENERY.galaxy.paint,
  ambient: SCENERY.galaxy.ambient,
  bricks: {
    normal: { fill: '#7dd3fc', shade: '#0369a1', light: '#f0f9ff' },
    tough: { fill: '#c084fc', shade: '#7e22ce', light: '#faf5ff' },
    armored: { fill: '#cbd5e1', shade: '#475569', light: '#f8fafc' },
    special: { fill: '#fde047', shade: '#ca8a04', light: '#fefce8' },
    outline: '#0b0626',
    motif: 'gem',
  },
  debris: ['#7dd3fc', '#c084fc', '#fde68a', '#ffffff'],
  hud: { band: 'rgba(11,6,38,0.8)', edge: '#c084fc' },
}

const SHRINE: World = {
  id: 'shrine',
  name: SCENERY.shrine.name,
  scene: 'shrine',
  paint: SCENERY.shrine.paint,
  ambient: SCENERY.shrine.ambient,
  bricks: {
    normal: { fill: '#f87171', shade: '#b91c1c', light: '#fee2e2' },
    tough: { fill: '#fbbf24', shade: '#b45309', light: '#fffbeb' },
    armored: { fill: '#a8a29e', shade: '#57534e', light: '#e7e5e4' },
    special: { fill: '#67e8f9', shade: '#0e7490', light: '#d9f4fb' },
    outline: '#3a0a0f',
    motif: 'knot',
  },
  debris: ['#f87171', '#fbbf24', '#67e8f9', '#ffffff'],
  hud: { band: 'rgba(30,19,56,0.8)', edge: '#f87171' },
}

const CYBER: World = {
  id: 'cyber',
  name: SCENERY.cyber.name,
  scene: 'cyber',
  paint: SCENERY.cyber.paint,
  ambient: SCENERY.cyber.ambient,
  bricks: {
    normal: { fill: '#22d3ee', shade: '#0e7490', light: '#cffafe' },
    tough: { fill: '#e879f9', shade: '#a21caf', light: '#fae8ff' },
    armored: { fill: '#a3e635', shade: '#4d7c0f', light: '#ecfccb' },
    special: { fill: '#fde047', shade: '#a16207', light: '#fefce8' },
    outline: '#020617',
    motif: 'circuit',
    neon: true,
  },
  debris: ['#22d3ee', '#e879f9', '#a3e635', '#ffffff'],
  hud: { band: 'rgba(5,3,15,0.82)', edge: '#22d3ee' },
}

const DRAGON: World = {
  id: 'dragon',
  name: SCENERY.dragon.name,
  scene: 'dragon',
  paint: SCENERY.dragon.paint,
  ambient: SCENERY.dragon.ambient,
  bricks: {
    normal: { fill: '#34d399', shade: '#047857', light: '#d1fae5' },
    tough: { fill: '#fb7185', shade: '#be123c', light: '#ffe4e6' },
    armored: { fill: '#94a3b8', shade: '#334155', light: '#e2e8f0' },
    special: { fill: '#facc15', shade: '#a16207', light: '#fef9c3' },
    outline: '#12030a',
    motif: 'scale',
  },
  debris: ['#34d399', '#facc15', '#fb7185', '#fb923c'],
  hud: { band: 'rgba(20,4,10,0.82)', edge: '#facc15' },
}

const MOON: World = {
  id: 'moon',
  name: SCENERY.moon.name,
  scene: 'moon',
  paint: SCENERY.moon.paint,
  ambient: SCENERY.moon.ambient,
  bricks: {
    normal: { fill: '#a78bfa', shade: '#5b21b6', light: '#ede9fe' },
    tough: { fill: '#f43f5e', shade: '#9f1239', light: '#ffe4e6' },
    armored: { fill: '#64748b', shade: '#1e293b', light: '#cbd5e1' },
    special: { fill: '#fde68a', shade: '#b45309', light: '#fffbeb' },
    outline: '#07030f',
    motif: 'crescent',
  },
  debris: ['#a78bfa', '#f43f5e', '#ede9fe', '#86efac'],
  hud: { band: 'rgba(6,3,13,0.84)', edge: '#a78bfa' },
}

/** The handcrafted levels' worlds, in level order. */
export const LEVEL_WORLDS: readonly World[] = [SAKURA, CANDY, CAFE, GALAXY, SHRINE, CYBER, DRAGON, MOON]

export const WORLDS: Readonly<Record<Exclude<WorldId, 'arcade'>, World>> = {
  sakura: SAKURA,
  candy: CANDY,
  cafe: CAFE,
  galaxy: GALAXY,
  shrine: SHRINE,
  cyber: CYBER,
  dragon: DRAGON,
  moon: MOON,
}

/** Endless's worlds: the arcade, with each level world's bricks in turn. */
const ARCADE_WORLDS: readonly World[] = LEVEL_WORLDS.map((world, i) => ({
  id: `arcade-${i}`,
  name: 'Starlight Arcade',
  scene: 'arcade',
  paint: SCENERY.arcade.paint,
  ambient: SCENERY.arcade.ambient,
  bricks: { ...world.bricks, motif: 'gloss', neon: false },
  debris: world.debris,
  hud: { band: 'rgba(10,10,35,0.82)', edge: '#22d3ee' },
}))

/** The world of a level: its own for the handcrafted ones, then the arcade, its colours changing each level. */
export function levelWorld(level: number): World {
  if (level >= 1 && level <= HANDCRAFTED_LEVELS) return LEVEL_WORLDS[level - 1]
  const index = (((Math.max(1, level) - HANDCRAFTED_LEVELS - 1) % ARCADE_WORLDS.length) + ARCADE_WORLDS.length) % ARCADE_WORLDS.length
  return ARCADE_WORLDS[index]
}

/** The world drawn for a brick theme on a level: the level's own, or the theme's everywhere. */
export function worldOf(look: BrickThemeLook, level: number): World {
  if (look.world === 'levels') return levelWorld(level)
  if (look.world === 'arcade') return ARCADE_WORLDS[0]
  return WORLDS[look.world]
}
