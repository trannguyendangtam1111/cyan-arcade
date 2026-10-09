import type { TileState } from '../engine/board'

/**
 * Word Guess's looks: tile sets for the board and themes for the keyboard. Only colours and shapes,
 * no pictures. Every tile set keeps the same meaning in its colours (teal for a letter in place, amber
 * for a letter elsewhere, grey for a letter not in the word), so a skin never changes what the board says.
 */

export const SKIN_SLOTS = ['tiles', 'keyboard'] as const
export type SkinSlot = (typeof SKIN_SLOTS)[number]

export const SLOT_LABELS: Record<SkinSlot, string> = { tiles: 'Tiles', keyboard: 'Keyboard' }

export interface Paint {
  /** A colour or a gradient. */
  background: string
  color: string
  border: string
  /** A box shadow, e.g. a glow; `none` for flat. */
  glow?: string
}

export interface TileTheme {
  id: string
  name: string
  radius: string
  /** Behind the board, for themes that bring their own backdrop. */
  backdrop?: string
  tiles: Record<TileState, Paint>
}

export interface KeyboardTheme {
  id: string
  name: string
  radius: string
  /** Behind the keys. */
  tray: string
  key: Paint
}

const TEAL = 'linear-gradient(160deg, #14b8a6, #0d9488)'
const AMBER = 'linear-gradient(160deg, #fcd34d, #f59e0b)'

export const TILE_THEMES: TileTheme[] = [
  {
    id: 'classic',
    name: 'Cyan Tiles',
    radius: '0.75rem',
    tiles: {
      empty: { background: '#ffffff', color: '#16323f', border: '#cfeef5' },
      filled: { background: '#ffffff', color: '#16323f', border: '#4b6776' },
      hint: { background: '#f0fdfa', color: '#5eada4', border: '#99f6e4' },
      correct: { background: TEAL, color: '#ffffff', border: '#0d9488', glow: '0 3px 0 #0f766e' },
      present: { background: AMBER, color: '#422006', border: '#f59e0b', glow: '0 3px 0 #d97706' },
      absent: { background: '#64748b', color: '#ffffff', border: '#64748b', glow: '0 3px 0 #475569' },
    },
  },
  {
    id: 'candy',
    name: 'Candy Tiles',
    radius: '1rem',
    tiles: {
      empty: { background: '#ffffff', color: '#831843', border: '#fbcfe8' },
      filled: { background: '#fff7fb', color: '#831843', border: '#f472b6' },
      hint: { background: '#fff7fb', color: '#f9a8d4', border: '#fbcfe8' },
      correct: { background: 'linear-gradient(160deg, #6ee7b7, #10b981)', color: '#064e3b', border: '#10b981', glow: 'inset 0 -4px 0 rgb(0 0 0 / 0.12), 0 3px 0 #059669' },
      present: { background: 'linear-gradient(160deg, #fef08a, #facc15)', color: '#713f12', border: '#eab308', glow: 'inset 0 -4px 0 rgb(0 0 0 / 0.1), 0 3px 0 #ca8a04' },
      absent: { background: 'linear-gradient(160deg, #e5e7eb, #cbd5e1)', color: '#475569', border: '#cbd5e1', glow: 'inset 0 -4px 0 rgb(0 0 0 / 0.08), 0 3px 0 #94a3b8' },
    },
  },
  {
    id: 'mochi',
    name: 'Mochi Tiles',
    radius: '1.35rem',
    tiles: {
      empty: { background: '#fffdf7', color: '#57534e', border: '#f5f5f4' },
      filled: { background: '#fffbeb', color: '#44403c', border: '#e7e5e4', glow: '0 4px 0 #e7e5e4' },
      hint: { background: '#fffdf7', color: '#a8a29e', border: '#f5f5f4' },
      correct: { background: '#a7f3d0', color: '#065f46', border: '#6ee7b7', glow: '0 4px 0 #6ee7b7' },
      present: { background: '#fde68a', color: '#92400e', border: '#fcd34d', glow: '0 4px 0 #fcd34d' },
      absent: { background: '#e2e8f0', color: '#64748b', border: '#cbd5e1', glow: '0 4px 0 #cbd5e1' },
    },
  },
  {
    id: 'neon',
    name: 'Neon Tiles',
    radius: '0.6rem',
    backdrop: '#0b1120',
    tiles: {
      empty: { background: '#0f172a', color: '#e2e8f0', border: '#1e293b' },
      filled: { background: '#0f172a', color: '#f8fafc', border: '#64748b' },
      hint: { background: '#0f172a', color: '#0e7490', border: '#164e63' },
      correct: { background: '#042f2e', color: '#5eead4', border: '#2dd4bf', glow: '0 0 14px rgb(45 212 191 / 0.7), inset 0 0 8px rgb(45 212 191 / 0.3)' },
      present: { background: '#2a1503', color: '#fde68a', border: '#fbbf24', glow: '0 0 14px rgb(251 191 36 / 0.6), inset 0 0 8px rgb(251 191 36 / 0.25)' },
      absent: { background: '#111827', color: '#64748b', border: '#1f2937' },
    },
  },
]

export const KEYBOARD_THEMES: KeyboardTheme[] = [
  {
    id: 'classic',
    name: 'Cyan Keys',
    radius: '0.75rem',
    tray: 'transparent',
    key: { background: '#e6f6fa', color: '#16323f', border: '#cfeef5', glow: '0 2px 0 #b6e3ee' },
  },
  {
    id: 'sakura',
    name: 'Sakura Keys',
    radius: '1rem',
    tray: '#fff1f7',
    key: { background: '#ffffff', color: '#9d174d', border: '#fbcfe8', glow: '0 3px 0 #f9a8d4' },
  },
  {
    id: 'midnight',
    name: 'Midnight Keys',
    radius: '0.7rem',
    tray: '#0f172a',
    key: { background: '#1e293b', color: '#e2e8f0', border: '#155e75', glow: '0 3px 0 #020617, 0 0 10px rgb(34 211 238 / 0.15)' },
  },
]

export const DEFAULT_TILES = TILE_THEMES[0]
export const DEFAULT_KEYBOARD = KEYBOARD_THEMES[0]

export function isSkinSlot(slot: string): slot is SkinSlot {
  return (SKIN_SLOTS as readonly string[]).includes(slot)
}

export function findTileTheme(id: string): TileTheme | undefined {
  return TILE_THEMES.find((theme) => theme.id === id)
}

export function findKeyboardTheme(id: string): KeyboardTheme | undefined {
  return KEYBOARD_THEMES.find((theme) => theme.id === id)
}

/** The CSS for a paint. */
export function paintStyle(paint: Paint) {
  return { background: paint.background, color: paint.color, borderColor: paint.border, boxShadow: paint.glow ?? 'none' }
}
