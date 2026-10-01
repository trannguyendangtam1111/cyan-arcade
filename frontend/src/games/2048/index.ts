import { lazy } from 'react'
import type { GameModule } from '@/games/types'

export const game2048Module: GameModule = {
  slug: '2048',
  controls: { keyboard: true, touch: true },
  Component: lazy(() => import('./Game2048')),
}
