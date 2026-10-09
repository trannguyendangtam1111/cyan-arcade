import type { GameCategory, GameResponse } from '@/api/games'
import { game2048Module } from './2048'
import { brickBreakerModule } from './brick-breaker'
import { flappyBirdModule } from './flappy-bird'
import { minesweeperModule } from './minesweeper'
import { snakeModule } from './snake'
import { sudokuModule } from './sudoku'
import { tetrisModule } from './tetris'
import { wordleModule } from './wordle'
import type { GameDefinition, GameModule } from './types'

/**
 * Every playable game implementation. Adding a game = create `src/games/<slug>/index.ts`
 * exporting a {@link GameModule}, then add it to this list. Nothing else in the platform changes.
 *
 * A game that is in the backend catalog but not in this list is shown as "coming soon".
 */
export const gameModules: readonly GameModule[] = [
  snakeModule,
  game2048Module,
  tetrisModule,
  minesweeperModule,
  flappyBirdModule,
  brickBreakerModule,
  wordleModule,
  sudokuModule,
]

export function findGameModule(slug: string): GameModule | undefined {
  return gameModules.find((module) => module.slug === slug)
}

/** Joins a catalog entry with its registered implementation (if any). */
export function toGameDefinition(game: GameResponse): GameDefinition {
  return {
    slug: game.slug,
    name: game.name,
    description: game.description,
    category: game.category,
    accentColor: game.accentColor,
    thumbnail: game.thumbnailUrl,
    featured: game.featured,
    module: findGameModule(game.slug),
  }
}

export const categoryLabels: Record<GameCategory, string> = {
  ARCADE: 'Arcade',
  PUZZLE: 'Puzzle',
  STRATEGY: 'Strategy',
  CARD: 'Cards',
}
