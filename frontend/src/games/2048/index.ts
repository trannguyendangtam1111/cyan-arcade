import { lazy } from 'react'
import { defineGameModule } from '@/games/types'

export const game2048Module = defineGameModule({
  slug: '2048',
  controls: { keyboard: true, touch: true },
  Component: lazy(() => import('./Game2048')),
  // AI mode is for admins; the AI is downloaded only for them (see GameModule.loadAi).
  loadAi: () => import('./ai/game2048Ai').then((ai) => ai.createGame2048Ai),
})
