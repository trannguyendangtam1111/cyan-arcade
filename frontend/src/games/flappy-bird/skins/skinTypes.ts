/**
 * Flappy Bird's cosmetics: how the bird, the pipes and the sky look. Only how they look: a skin is
 * colours and decorations for the renderer, and the engine never sees one. Every bird flies with the
 * same physics and every pipe has the same collision box, whatever is worn.
 *
 * Prices and level requirements are the shop's (the server's): a skin here only says whether it is
 * the game's own free look or one to get from the shop.
 */

/** The pieces of the game a skin can dress. The shop's `slot` for a Flappy Bird skin is one of these. */
export type SkinSlot = 'bird' | 'pipes' | 'sky'

export type SkinCategory = 'default' | 'cute' | 'anime' | 'fantasy' | 'fun' | 'scifi'

export type SkinRarity = 'common' | 'rare' | 'epic' | 'legendary'

/** How a skin is had: everyone's from the start, or bought in the shop. */
export type UnlockRequirement = { kind: 'free' } | { kind: 'shop' }

interface SkinBase {
  /** Stable id; for a shop skin, the shop item's `icon`. Unique within its slot. */
  id: string
  name: string
  category: SkinCategory
  rarity: SkinRarity
  description: string
  unlock: UnlockRequirement
}

/** Something the bird wears on its head or body. */
export type BirdAccessory =
  | 'tuft'
  | 'bow'
  | 'sprout'
  | 'ears'
  | 'eggshell'
  | 'puffs'
  | 'blossom'
  | 'visor'
  | 'tiara'
  | 'topknot'
  | 'horns'
  | 'flame-crest'
  | 'halo'
  | 'hood'
  | 'butter'
  | 'straw'

/** Little particles the bird leaves behind as it flies. */
export type BirdTrail = 'none' | 'petals' | 'sparkles' | 'embers' | 'smoke' | 'neon' | 'feathers' | 'mist' | 'bubbles' | 'shadow'

export interface BirdLook {
  /** The body's outline: round, a squashed blob, a lumpy potato, a slice of toast or a cup. */
  shape: 'round' | 'blob' | 'potato' | 'toast' | 'cup'
  body: string
  belly: string
  wing: string
  beak: string
  /** Outline colour of the whole bird. */
  outline: string
  eye: 'dot' | 'sparkle' | 'glow' | 'focused'
  /** Colour of the eye's iris (for `glow`, the glow). */
  eyeColor: string
  /** Rosy cheeks, if any. */
  cheek?: string
  accessory?: BirdAccessory
  /** Main colour of the accessory. */
  accessoryColor?: string
  trail: BirdTrail
  trailColor?: string
  /** A soft glow around the bird. */
  glow?: string
  /** Spots, seeds or freckles on the body. */
  spots?: string
}

export interface BirdSkin extends SkinBase {
  look: BirdLook
}

export interface PipeLook {
  body: string
  /** The shaded side of the pipe. */
  shade: string
  /** The rim at the end facing the gap. */
  cap: string
  capShade: string
  outline: string
  /** Decoration painted along the body. */
  pattern: 'shine' | 'stripes' | 'puffs' | 'seeds' | 'petals' | 'energy' | 'stars' | 'bricks' | 'facets' | 'scales' | 'circuit' | 'grid'
  patternColor: string
  /** The shape of the end facing the gap. */
  capStyle: 'rim' | 'round' | 'leafy' | 'roof' | 'ring' | 'spire' | 'battlement' | 'horns' | 'tech'
  glow?: string
}

export interface PipeSkin extends SkinBase {
  look: PipeLook
}

export interface SkyLook {
  /** Top and bottom of the sky gradient. */
  top: string
  bottom: string
  /** Far-away scenery along the horizon. */
  scenery: 'hills' | 'dunes' | 'candy-hills' | 'blossom-trees' | 'city' | 'planet'
  sceneryColor: string
  sceneryShade: string
  /** What floats in the sky. */
  ambient: 'clouds' | 'stars' | 'petals' | 'candy-clouds'
  ambientColor: string
  ground: string
  groundShade: string
  groundTop: string
  /** The sun, the moon or a planet, if any. */
  orb?: { color: string; glow: string }
}

export interface SkyTheme extends SkinBase {
  look: SkyLook
}

export interface SkinsBySlot {
  bird: BirdSkin
  pipes: PipeSkin
  sky: SkyTheme
}

/** The look worn in each slot. */
export type Outfit = { [Slot in SkinSlot]: SkinsBySlot[Slot] }
