import { lazy } from 'react'
import { defineGameModule } from '@/games/types'
import { SLOT_LABELS } from './skins/slots'

export const flappyBirdModule = defineGameModule({
  slug: 'flappy-bird',
  controls: { keyboard: true, touch: true },
  Component: lazy(() => import('./FlappyBirdGame')),
  // AI mode is for admins; the AI is downloaded only for them (see GameModule.loadAi).
  loadAi: () => import('./ai/flappyAi').then((ai) => ai.createFlappyAi),
  // Its birds, obstacles and skies are sold in the shop; the shop draws them with this.
  cosmetics: {
    slots: SLOT_LABELS,
    Preview: lazy(() => import('./components/SkinPreview')),
  },
})
