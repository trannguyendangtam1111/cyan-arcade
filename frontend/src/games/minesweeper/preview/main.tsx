import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { initTheme } from '@/lib/theme'
import '@/styles/index.css'
import { BOARDS, type BoardName } from '../engine/minesweeperEngine'
import type { Orientation } from '../components/boardLayout'
import { MinesweeperBoardPreview } from './MinesweeperBoardPreview'

/**
 * Mounts the board preview for `dev/minesweeper-board.html`, which only the dev server serves: the
 * production build has one entry, `index.html`, and never reaches this file.
 * `?board=intermediate&orientation=portrait&seed=42` picks what it shows.
 */
const params = new URLSearchParams(window.location.search)
const board = params.get('board')
const orientation = params.get('orientation')
const seed = Number(params.get('seed'))

initTheme()
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MinesweeperBoardPreview
      board={board && board in BOARDS ? (board as BoardName) : 'expert'}
      seed={Number.isInteger(seed) && seed !== 0 ? seed : 20261106}
      orientation={orientation === 'portrait' || orientation === 'landscape' ? (orientation as Orientation) : undefined}
    />
  </StrictMode>,
)
