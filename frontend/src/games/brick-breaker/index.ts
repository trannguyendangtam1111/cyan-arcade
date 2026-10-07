import { lazy } from 'react'
import { defineGameModule } from '@/games/types'
import { SLOT_LABELS } from './skins/slots'

export const brickBreakerModule = defineGameModule({
  slug: 'brick-breaker',
  controls: { keyboard: true, touch: true },
  Component: lazy(() => import('./BrickBreakerGame')),
  // AI mode is for admins; the AI is downloaded only for them (see GameModule.loadAi).
  loadAi: () => import('./ai/brickAi').then((ai) => ai.createBrickAi),
  // Its paddles, balls and brick themes are sold in the shop; the shop draws them with this.
  cosmetics: {
    slots: SLOT_LABELS,
    Preview: lazy(() => import('./components/SkinPreview')),
  },
})
