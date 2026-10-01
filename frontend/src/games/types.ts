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
  Component: ComponentType<GameProps>
}

/** Props the platform passes to a game's root component. */
export interface GameProps {
  /** Call when a human run begins. The platform opens a score session. Never call it for AI runs. */
  onGameStart: () => void
  /** Call once when that run ends. The platform submits the score. */
  onGameOver: (result: GameResult) => void
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
