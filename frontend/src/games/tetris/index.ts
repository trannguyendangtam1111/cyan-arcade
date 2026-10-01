import { lazy } from 'react'
import type { GameModule } from '@/games/types'

export const tetrisModule: GameModule = {
  slug: 'tetris',
  controls: { keyboard: true, touch: true },
  Component: lazy(() => import('./TetrisGame')),
}
