/**
 * Chess's looks: board themes and piece sets. Only colours: every piece keeps its shape and every
 * marker its meaning, so a skin never changes what the board says. Each board gives pieces a halo
 * that stands out on both its squares, so dark pieces stay readable on a dark board (a test checks
 * every combination).
 */

export const SKIN_SLOTS = ['board', 'pieces'] as const
export type SkinSlot = (typeof SKIN_SLOTS)[number]

export const SLOT_LABELS: Record<SkinSlot, string> = { board: 'Board', pieces: 'Pieces' }

export interface BoardTheme {
  id: string
  name: string
  light: string
  dark: string
  /** Around the board. */
  frame: string
  /** Coordinates on light and on dark squares. */
  lightInk: string
  darkInk: string
  /** The squares of the last move, and the selected piece's square. */
  lastMove: string
  selected: string
  /** Dots for quiet moves and rings for captures. */
  target: string
  /** Drawn around every piece, under its outline. */
  halo: string
  /** The glow under a king in check. */
  check: string
}

export interface PieceSet {
  id: string
  name: string
  whiteFill: string
  whiteDetail: string
  blackFill: string
  blackDetail: string
  outline: string
}

export const BOARD_THEMES: BoardTheme[] = [
  {
    id: 'arcade',
    name: 'Arcade',
    light: '#e6f7fb',
    dark: '#6fbfd1',
    frame: '#16323f',
    lightInk: '#2b6577',
    darkInk: '#0e3a47',
    lastMove: 'rgba(250, 204, 21, 0.45)',
    selected: 'rgba(34, 211, 238, 0.6)',
    target: 'rgba(22, 50, 63, 0.38)',
    halo: 'rgba(255, 255, 255, 0.55)',
    check: 'rgba(225, 29, 72, 0.85)',
  },
  {
    id: 'mint',
    name: 'Mint Garden',
    light: '#f6f1de',
    dark: '#7fb08a',
    frame: '#1f3d2a',
    lightInk: '#3f6b4c',
    darkInk: '#173a22',
    lastMove: 'rgba(250, 204, 21, 0.45)',
    selected: 'rgba(52, 211, 153, 0.6)',
    target: 'rgba(31, 61, 42, 0.38)',
    halo: 'rgba(255, 255, 255, 0.55)',
    check: 'rgba(225, 29, 72, 0.85)',
  },
  {
    id: 'sakura',
    name: 'Sakura Court',
    light: '#fde8ef',
    dark: '#cd7f9e',
    frame: '#4a1d33',
    lightInk: '#8a3c5c',
    darkInk: '#4a1d33',
    lastMove: 'rgba(253, 224, 71, 0.5)',
    selected: 'rgba(244, 114, 182, 0.55)',
    target: 'rgba(74, 29, 51, 0.38)',
    halo: 'rgba(255, 255, 255, 0.55)',
    check: 'rgba(190, 18, 60, 0.85)',
  },
  {
    id: 'midnight',
    name: 'Midnight Hall',
    light: '#46577c',
    dark: '#222d4a',
    frame: '#0b1120',
    lightInk: '#c7d2fe',
    darkInk: '#a5b4fc',
    lastMove: 'rgba(56, 189, 248, 0.38)',
    selected: 'rgba(34, 211, 238, 0.5)',
    target: 'rgba(224, 242, 254, 0.45)',
    halo: '#d6e1f5',
    check: 'rgba(251, 113, 133, 0.9)',
  },
]

export const PIECE_SETS: PieceSet[] = [
  {
    id: 'arcade',
    name: 'Arcade',
    whiteFill: '#ffffff',
    whiteDetail: '#16323f',
    blackFill: '#26364a',
    blackDetail: '#cfe9f0',
    outline: '#0c1820',
  },
  {
    id: 'candy',
    name: 'Candy Set',
    whiteFill: '#fff4d6',
    whiteDetail: '#7a3e9d',
    blackFill: '#3d4fc4',
    blackDetail: '#ffd6f0',
    outline: '#22123a',
  },
  {
    id: 'copper',
    name: 'Copper & Ivory',
    whiteFill: '#fbf3df',
    whiteDetail: '#6b3a16',
    blackFill: '#9a4a1c',
    blackDetail: '#ffe0b8',
    outline: '#2a1407',
  },
]

export const DEFAULT_BOARD = BOARD_THEMES[0]
export const DEFAULT_PIECES = PIECE_SETS[0]

export function findBoardTheme(id: string): BoardTheme | undefined {
  return BOARD_THEMES.find((theme) => theme.id === id)
}

export function findPieceSet(id: string): PieceSet | undefined {
  return PIECE_SETS.find((set) => set.id === id)
}

export function isSkinSlot(slot: string): slot is SkinSlot {
  return (SKIN_SLOTS as readonly string[]).includes(slot)
}
