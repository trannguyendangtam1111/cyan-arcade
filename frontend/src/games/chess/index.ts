import { lazy } from 'react'
import { defineGameModule } from '@/games/types'
import { SLOT_LABELS } from './skins'

export const chessModule = defineGameModule({
  slug: 'chess',
  controls: { keyboard: true, touch: true },
  Component: lazy(() => import('./ChessGame')),
  // AI mode is for admins: games against Stockfish, analysis and reviews. Stockfish runs on the server,
  // which checks the caller on every request; this downloads only how its answers are shown, and only
  // for admins (see GameModule.loadAi). Move hints are everyone's and need no AI chunk.
  loadAi: () => import('./ai/chessAi').then((ai) => ai.createChessAi),
  // Its boards and piece sets are sold in the shop; the shop draws them with this.
  cosmetics: {
    slots: SLOT_LABELS,
    Preview: lazy(() => import('./components/SkinPreview')),
  },
})
