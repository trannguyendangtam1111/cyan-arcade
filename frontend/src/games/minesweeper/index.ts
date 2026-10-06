import { lazy } from 'react'
import { defineGameModule } from '@/games/types'

/** Minesweeper has no AI: it simply declares no `loadAi`, and the platform shows no AI controls. */
export const minesweeperModule = defineGameModule({
  slug: 'minesweeper',
  controls: { keyboard: true, touch: true },
  Component: lazy(() => import('./MinesweeperGame')),
})
