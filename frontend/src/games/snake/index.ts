import { lazy } from 'react'
import type { GameModule } from '@/games/types'

export const snakeModule: GameModule = {
  slug: 'snake',
  controls: { keyboard: true, touch: true },
  Component: lazy(() => import('./SnakeGame')),
}
