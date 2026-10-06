import type { ComponentType } from 'react'
import type { GameCategory } from '@/api/games'

/**
 * Everything the hub needs to show one game. Display metadata comes from the backend catalog
 * (single source of truth); `module` is the frontend implementation, when one is registered.
 * All hub UI (cards, detail page, leaderboard tabs) renders from this type and nothing else.
 */
export interface GameDefinition {
  slug: string
  name: string
  description: string
  category: GameCategory
  /** The game's identity color (`#rrggbb`). Apply it through the `--accent` CSS variable. */
  accentColor: string
  /** URL of the card artwork. */
  thumbnail: string
  /** Whether the hub puts this game in the spotlight on the home page. */
  featured: boolean
  /** The playable implementation, or `undefined` while the game is still "coming soon". */
  module?: GameModule
}

/**
 * The contract a playable game implements. This is the only thing the platform knows about a
 * game's code; everything else (engine, components, hooks, assets) stays inside `src/games/<slug>/`.
 */
export interface GameModule {
  /** Identical to the backend catalog slug, e.g. `snake`, `2048`, `tetris`. */
  slug: string
  controls: { keyboard: boolean; touch: boolean }
  /**
   * The game's root component. Declare it with `lazy(() => import('./MyGame'))` in the module's
   * `index.ts` so each game ships in its own bundle chunk and the catalog stays lightweight.
   */
  Component: ComponentType<GameProps<never>>
  /**
   * Downloads the game's AI, for a game that has one: `() => import('./ai/myAi').then((ai) => ai.createMyAi)`.
   * AI mode is for admins: the platform calls this only after the server has confirmed that the
   * player may use it, and in production the AI's chunk is only served to admins. Nothing else may
   * import the AI's code, or it would ship with the game to everyone.
   */
  loadAi?: () => Promise<() => unknown>
  /** For a game with skins in the shop: how to show them. See {@link GameCosmeticsModule}. */
  cosmetics?: GameCosmeticsModule
}

/**
 * How the platform shows a game's skins (shop items of type `GAME_SKIN`) outside the game: in the
 * shop and the inventory. The game alone knows what its skins look like.
 */
export interface GameCosmeticsModule {
  /** What each slot is called, e.g. `{ bird: 'Bird' }`. */
  slots: Record<string, string>
  /**
   * A picture of one skin. Declare it with `lazy(...)` so the shop only downloads it when it shows a
   * skin. It must draw something reasonable (or nothing) for a skin id it does not know.
   */
  Preview: ComponentType<{ slot: string; skinId: string; className?: string }>
}

/** A game module whose component and AI belong together. See {@link defineGameModule}. */
export interface TypedGameModule<Ai> {
  slug: string
  controls: { keyboard: boolean; touch: boolean }
  Component: ComponentType<GameProps<Ai>>
  loadAi?: () => Promise<() => Ai>
  cosmetics?: GameCosmeticsModule
}

/** Declares a game module, checking that its `loadAi` gives the AI its component expects. */
export function defineGameModule<Ai>(module: TypedGameModule<Ai>): GameModule {
  return module as unknown as GameModule
}

/** Props the platform passes to a game's root component. */
export interface GameProps<Ai = unknown> {
  /** Call when a human run begins. The platform opens a score session. Never call it for AI runs. */
  onGameStart: () => void
  /** Call once when that run ends. The platform submits the score. */
  onGameOver: (result: GameResult) => void
  /**
   * Creates the game's AI. Given only to players who may use AI mode (admins); without it the game
   * is played by a human only and shows no AI controls.
   */
  ai?: () => Ai
  /**
   * The game's skins from the shop and which ones the player wears, for a module that declares
   * `cosmetics`. Skins are only looks: a game must play exactly the same whatever is worn.
   */
  cosmetics?: GameCosmetics
}

/** One of a game's skins as the player stands with it. Everything here is the server's. */
export interface GameSkin {
  /** The shop item. */
  itemId: number
  /** The piece of the game it dresses, e.g. `bird`. */
  slot: string
  /** Which look, in the game's own terms (the shop item's `icon`). */
  skinId: string
  name: string
  price: number
  minLevel: number
  owned: boolean
  equipped: boolean
  /** Whether the player's level allows buying it; `null` for a guest. */
  unlocked: boolean | null
}

/**
 * A game's skins, from the platform's shop and inventory. A game never buys or grants anything
 * itself: it shows what the player has, and asks the platform to wear one.
 */
export interface GameCosmetics {
  /** Guests play with the game's own looks; skins need an account. */
  signedIn: boolean
  /** Every skin the shop has for this game, or `null` while loading. */
  skins: GameSkin[] | null
  /**
   * Wears an owned skin in its slot, or with `null` goes back to the game's own look there. The
   * server checks the player owns it.
   */
  equip: (slot: string, itemId: number | null) => void
  /** Whether a change is being saved. */
  saving: boolean
  /** Where to get skins: the shop, at the skins. */
  shopPath: string
  /** Where to sign in, coming back to this game afterwards. */
  loginPath: string
}

/**
 * Where a run stands, in the terms shared by every game's UI:
 * waiting for the player, in progress, paused, lost, or (for games that can be beaten) won.
 */
export type GameStatus = 'ready' | 'playing' | 'paused' | 'over' | 'won'

export interface GameResult {
  score: number
  durationMs: number
  /** Game-specific extras (lines cleared, max tile, ...) kept opaque to the platform. */
  metadata?: Record<string, unknown>
}
