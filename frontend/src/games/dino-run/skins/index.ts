import { JOURNEY, type SceneryId } from '@/games/shared/pixel/scenery'

/**
 * Dino Run's looks: how Pip and the obstacles look. Colours only. A skin recolours the parts of a
 * shape (see `engine/shapes.ts`) and never changes the shape, so every skin collides, jumps and
 * scores exactly alike.
 *
 * The world is not a skin: every run, a player's or the AI's, goes through the arcade's shared pixel
 * worlds (Brick Breaker's levels) in turn, a new one every {@link JOURNEY_LEG} points, each with the
 * ground and obstacle colours Dino Run adds to it.
 *
 * Prices and levels are the shop's: a skin here only says whether it is the game's own free look.
 */

export const SKIN_SLOTS = ['runner', 'obstacles'] as const
export type SkinSlot = (typeof SKIN_SLOTS)[number]

export { SLOT_LABELS } from './slots'

/** Colours by the letters of a shape. */
export type Palette = Readonly<Record<string, string>>

interface Look {
  /** Stable id; for a shop skin, the shop item's `icon`. */
  id: string
  name: string
  /** The game's own look, free for everyone. */
  free: boolean
}

export interface RunnerLook extends Look {
  /** o outline, b body, l belly, s spikes, c cheek, w eye shine, e eye. */
  palette: Palette
}

export interface ObstacleColours {
  /** o outline, a main, b shade, c light, d accent (e eyes, for the bat). */
  mound: Palette
  pillar: Palette
  bat: Palette
}

export interface ObstacleLook extends Look {
  /** `null`: the colours of whichever world is shown. */
  colours: ObstacleColours | null
}

export interface Outfit {
  runner: RunnerLook
  obstacles: ObstacleLook
}

export const RUNNERS: readonly RunnerLook[] = [
  {
    id: 'pip',
    name: 'Mint Pip',
    free: true,
    palette: { o: '#134e4a', b: '#5eead4', l: '#ccfbf1', s: '#f472b6', c: '#fda4af', w: '#ffffff', e: '#0f172a' },
  },
  {
    id: 'sakura',
    name: 'Sakura Pip',
    free: false,
    palette: { o: '#831843', b: '#f9a8d4', l: '#fdf2f8', s: '#be185d', c: '#fb7185', w: '#ffffff', e: '#500724' },
  },
  {
    id: 'midnight',
    name: 'Midnight Pip',
    free: false,
    palette: { o: '#020617', b: '#3730a3', l: '#a5b4fc', s: '#22d3ee', c: '#e879f9', w: '#ffffff', e: '#22d3ee' },
  },
]

/** The candy obstacles, sold in the shop. */
const CANDY: ObstacleColours = {
  mound: { o: '#4a0d2e', a: '#fbcfe8', b: '#ec4899', c: '#ffffff', d: '#ffffff' },
  pillar: { o: '#042f2e', a: '#ccfbf1', b: '#2dd4bf', c: '#ffffff', d: '#f472b6' },
  bat: { o: '#2e1065', a: '#ede9fe', b: '#a78bfa', c: '#f9a8d4', e: '#2e1065' },
}

export const OBSTACLES: readonly ObstacleLook[] = [
  { id: 'world', name: 'World Match', free: true, colours: null },
  { id: 'candy', name: 'Candy Pop', free: false, colours: CANDY },
]

/** Points between worlds: the journey every run takes. */
export const JOURNEY_LEG = 500

/** What Dino Run adds to a shared world: its ground and the obstacles' colours there. */
export interface Terrain {
  ground: { top: string; edge: string; soil: string; speck: string }
  obstacles: ObstacleColours
}

const terrain = (ground: Terrain['ground'], main: string, shade: string, light: string, accent: string, outline: string, bat: [string, string]): Terrain => ({
  ground,
  obstacles: {
    mound: { o: outline, a: main, b: shade, c: light, d: accent },
    pillar: { o: outline, a: light, b: shade, c: '#ffffff', d: accent },
    bat: { o: outline, a: bat[0], b: bat[1], c: accent, e: outline },
  },
})

/**
 * Ground and obstacle colours for each world, taken from the world's own scenery colours. Every
 * obstacle has a very dark outline and a light body, so its silhouette stands out from dark, light and
 * busy scenery alike: tests measure at least 3:1 contrast (WCAG's bar for graphics) against every
 * scenery pixel an obstacle can stand in front of, in every world, for every obstacle look.
 */
export const TERRAIN: Readonly<Record<SceneryId, Terrain>> = {
  sakura: terrain({ top: '#ec8fbd', edge: '#f9c6de', soil: '#c2669a', speck: '#fbcfe8' }, '#f472b6', '#be185d', '#fce7f3', '#fde047', '#5b1035', ['#a78bfa', '#6d28d9']),
  candy: terrain({ top: '#f472b6', edge: '#fff1f7', soil: '#db2777', speck: '#fde68a' }, '#5eead4', '#0f766e', '#eafaf2', '#f9a8d4', '#4a0d2e', ['#fdba74', '#c2410c']),
  cafe: terrain({ top: '#8b5a3c', edge: '#c08457', soil: '#5c3a26', speck: '#fcd29a' }, '#d6a77a', '#8b5a3c', '#fff1dc', '#f699a0', '#2b170d', ['#fcd29a', '#c08457']),
  galaxy: terrain({ top: '#4c1d95', edge: '#a78bfa', soil: '#2e1065', speck: '#fde68a' }, '#a5b4fc', '#4338ca', '#e0e7ff', '#fde68a', '#0f0a2e', ['#f0abfc', '#a21caf']),
  shrine: terrain({ top: '#57534e', edge: '#a8a29e', soil: '#3f3647', speck: '#67e8f9' }, '#e7e5e4', '#78716c', '#ffffff', '#d1262b', '#1c1917', ['#e7e5e4', '#78716c']),
  cyber: terrain({ top: '#0a0620', edge: '#22d3ee', soil: '#050314', speck: '#e879f9' }, '#e879f9', '#a21caf', '#a5f3fc', '#fde047', '#020617', ['#e879f9', '#86198f']),
  dragon: terrain({ top: '#14040a', edge: '#f97316', soil: '#24070d', speck: '#facc15' }, '#5eead4', '#0f766e', '#ccfbf1', '#fde047', '#12030a', ['#e9d5ff', '#a855f7']),
  moon: terrain({ top: '#05020a', edge: '#2a1650', soil: '#05020a', speck: '#c4b5fd' }, '#a78bfa', '#5b21b6', '#ede9fe', '#86efac', '#07030f', ['#ddd6fe', '#8b5cf6']),
  arcade: terrain({ top: '#0a0620', edge: '#22d3ee', soil: '#050314', speck: '#fde047' }, '#f472b6', '#9d174d', '#fdf2f8', '#fde047', '#0a0a23', ['#22d3ee', '#0e7490']),
}

export const SKINS: { readonly [Slot in SkinSlot]: readonly Outfit[Slot][] } = {
  runner: RUNNERS,
  obstacles: OBSTACLES,
}

export const DEFAULT_OUTFIT: Outfit = { runner: RUNNERS[0], obstacles: OBSTACLES[0] }

export function isSkinSlot(slot: string): slot is SkinSlot {
  return (SKIN_SLOTS as readonly string[]).includes(slot)
}

export function findSkin<Slot extends SkinSlot>(slot: Slot, id: string): Outfit[Slot] | undefined {
  return (SKINS[slot] as readonly Outfit[Slot][]).find((skin) => skin.id === id)
}

/** The world at a score: the same for every run and every player, human or AI. */
export function sceneryAt(score: number): SceneryId {
  return JOURNEY[Math.floor(Math.max(0, score) / JOURNEY_LEG) % JOURNEY.length]
}

/** The obstacles' colours in a world, for the worn obstacle look. */
export function obstacleColours(look: ObstacleLook, scenery: SceneryId): ObstacleColours {
  return look.colours ?? TERRAIN[scenery].obstacles
}
