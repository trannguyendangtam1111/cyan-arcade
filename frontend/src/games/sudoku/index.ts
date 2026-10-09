import { lazy } from 'react'
import { defineGameModule } from '@/games/types'
import { SLOT_LABELS } from './skins'

export const sudokuModule = defineGameModule({
  slug: 'sudoku',
  controls: { keyboard: true, touch: true },
  Component: lazy(() => import('./SudokuGame')),
  // AI mode is for admins. The solving happens on the server, which checks the caller; this
  // downloads only the playback, and only for them (see GameModule.loadAi).
  loadAi: () => import('./ai/sudokuAiPlayer').then((ai) => ai.createSudokuAiPlayer),
  // Its boards and number pads are sold in the shop; the shop draws them with this.
  cosmetics: {
    slots: SLOT_LABELS,
    Preview: lazy(() => import('./components/SkinPreview')),
  },
})
