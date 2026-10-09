import { lazy } from 'react'
import { defineGameModule } from '@/games/types'
import { SLOT_LABELS } from './skins/slots'

export const dinoRunModule = defineGameModule({
  slug: 'dino-run',
  controls: { keyboard: true, touch: true },
  Component: lazy(() => import('./DinoRunGame')),
  // AI mode is for admins; the AI is downloaded only for them (see GameModule.loadAi).
  loadAi: () => import('./ai/dinoAi').then((ai) => ai.createDinoAiKit),
  // Its runners, obstacles and worlds are sold in the shop; the shop draws them with this.
  cosmetics: {
    slots: SLOT_LABELS,
    Preview: lazy(() => import('./components/SkinPreview')),
  },
})
