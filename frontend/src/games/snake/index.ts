import { lazy } from 'react'
import { defineGameModule } from '@/games/types'

export const snakeModule = defineGameModule({
  slug: 'snake',
  controls: { keyboard: true, touch: true },
  Component: lazy(() => import('./SnakeGame')),
  // AI mode is for admins; the AI is downloaded only for them (see GameModule.loadAi).
  loadAi: () => import('./ai/snakeAi').then((ai) => ai.createSnakeAi),
})
