/**
 * Brick Breaker's cosmetics: how the paddle, the ball and the bricks (with their arena) look. Only
 * how they look: a skin is colours and decoration for the renderer, and the engine never sees one.
 * Paddle width, ball size and speed, brick toughness, scores and drops are the same whatever is worn.
 *
 * Prices and level requirements are the shop's (the server's): a skin here only says whether it is
 * the game's own free look or one to get from the shop.
 */

export type SkinSlot = 'paddle' | 'ball' | 'bricks'

export type SkinCategory = 'default' | 'cute' | 'anime' | 'fantasy' | 'scifi' | 'space'

export type SkinRarity = 'common' | 'rare' | 'epic' | 'legendary'

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

export interface PaddleLook {
  body: string
  shade: string
  /** The rim along the top, where the ball bounces. */
  rim: string
  outline: string
  /** The pixel art on its face. */
  pattern: 'face' | 'candy' | 'neon' | 'blossom' | 'stars' | 'scales' | 'circuit' | 'mochi'
  patternColor: string
  glow?: string
}

export interface PaddleSkin extends SkinBase {
  look: PaddleLook
}

export interface BallLook {
  core: string
  rim: string
  highlight: string
  /** The colour of its trail. */
  trail: string
  /** The pixel art inside it; some of it moves. */
  pattern: 'shine' | 'ember' | 'frost' | 'plasma' | 'star' | 'bubble' | 'galaxy'
  glow?: string
}

export interface BallSkin extends SkinBase {
  look: BallLook
}

/**
 * The pixel worlds bricks and the arena are drawn in: one for each handcrafted level, and the
 * arcade of Endless. Each has its scenery, its ambient sparkle and its brick colours.
 */
export type WorldId = 'sakura' | 'candy' | 'cafe' | 'galaxy' | 'shrine' | 'cyber' | 'dragon' | 'moon' | 'arcade'

export interface BrickThemeLook {
  /** The world the bricks and the arena are drawn in, or `levels` for each level's own world. */
  world: WorldId | 'levels'
}

export interface BrickTheme extends SkinBase {
  look: BrickThemeLook
}

export interface SkinsBySlot {
  paddle: PaddleSkin
  ball: BallSkin
  bricks: BrickTheme
}

/** The look worn in each slot. */
export type Outfit = { [Slot in SkinSlot]: SkinsBySlot[Slot] }
