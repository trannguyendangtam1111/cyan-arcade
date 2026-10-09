import type { CSSProperties } from 'react'

/**
 * Sudoku's looks: board themes and number-pad themes. Only colours, no pictures. Every theme keeps
 * the same meaning: clues darker than the player's digits, the selected cell strongest, mistakes in a
 * warm red with a marker that does not rely on colour, so a skin never changes what the board says.
 */

export const SKIN_SLOTS = ['board', 'pad'] as const
export type SkinSlot = (typeof SKIN_SLOTS)[number]

export const SLOT_LABELS: Record<SkinSlot, string> = { board: 'Board', pad: 'Number pad' }

export interface BoardTheme {
  id: string
  name: string
  /** Behind and around the grid. */
  frame: string
  cell: string
  /** Thin lines between cells, and the thick ones around boxes. */
  line: string
  box: string
  given: string
  entry: string
  note: string
  related: string
  same: string
  selected: string
  selectedInk: string
  wrong: string
  wrongInk: string
  hint: string
}

export interface PadTheme {
  id: string
  name: string
  key: string
  ink: string
  border: string
  shadow: string
  radius: string
  /** The key of the digit being placed. */
  active: string
  activeInk: string
}

export const BOARD_THEMES: BoardTheme[] = [
  {
    id: 'classic',
    name: 'Cyan Grid',
    frame: '#16323f',
    cell: '#ffffff',
    line: '#cfe3ea',
    box: '#16323f',
    given: '#16323f',
    entry: '#0e7490',
    note: '#4b6776',
    related: '#ecf9fc',
    same: '#c4eef7',
    selected: '#22d3ee',
    selectedInk: '#083344',
    wrong: '#ffe4e6',
    wrongInk: '#be123c',
    hint: '#fef3c7',
  },
  {
    id: 'mint',
    name: 'Mint Paper',
    frame: '#14532d',
    cell: '#fffdf5',
    line: '#d9eadf',
    box: '#166534',
    given: '#1c3326',
    entry: '#047857',
    note: '#4d6b5a',
    related: '#eefaf2',
    same: '#c8f0d8',
    selected: '#6ee7b7',
    selectedInk: '#064e3b',
    wrong: '#fee2e2',
    wrongInk: '#b91c1c',
    hint: '#fef9c3',
  },
  {
    id: 'sakura',
    name: 'Sakura Grid',
    frame: '#9d174d',
    cell: '#fffafc',
    line: '#f7d6e4',
    box: '#be185d',
    given: '#500724',
    entry: '#be185d',
    note: '#86536b',
    related: '#fdf0f6',
    same: '#fbd5e6',
    selected: '#f9a8d4',
    selectedInk: '#500724',
    wrong: '#fee2e2',
    wrongInk: '#b91c1c',
    hint: '#fef3c7',
  },
  {
    id: 'midnight',
    name: 'Midnight Grid',
    frame: '#020617',
    cell: '#0f172a',
    line: '#1e293b',
    box: '#475569',
    given: '#e2e8f0',
    entry: '#67e8f9',
    note: '#94a3b8',
    related: '#13203a',
    same: '#164e63',
    selected: '#0891b2',
    selectedInk: '#ecfeff',
    wrong: '#4c0519',
    wrongInk: '#fda4af',
    hint: '#422006',
  },
]

export const PAD_THEMES: PadTheme[] = [
  {
    id: 'classic',
    name: 'Cyan Pad',
    key: '#ffffff',
    ink: '#0e7490',
    border: '#cfeef5',
    shadow: '0 3px 0 #b6e3ee',
    radius: '0.9rem',
    active: '#22d3ee',
    activeInk: '#083344',
  },
  {
    id: 'candy',
    name: 'Candy Pad',
    key: 'linear-gradient(160deg, #fef9c3, #fde68a)',
    ink: '#6d28d9',
    border: '#fcd34d',
    shadow: '0 3px 0 #e9d5ff',
    radius: '1.4rem',
    active: 'linear-gradient(160deg, #e9d5ff, #c4b5fd)',
    activeInk: '#4c1d95',
  },
]

export const DEFAULT_BOARD = BOARD_THEMES[0]
export const DEFAULT_PAD = PAD_THEMES[0]

export function isSkinSlot(slot: string): slot is SkinSlot {
  return (SKIN_SLOTS as readonly string[]).includes(slot)
}

export function findBoardTheme(id: string): BoardTheme | undefined {
  return BOARD_THEMES.find((theme) => theme.id === id)
}

export function findPadTheme(id: string): PadTheme | undefined {
  return PAD_THEMES.find((theme) => theme.id === id)
}

/** The board theme as CSS variables for `sudoku.css`. */
export function boardStyle(theme: BoardTheme): CSSProperties {
  return {
    '--sd-frame': theme.frame,
    '--sd-cell': theme.cell,
    '--sd-line': theme.line,
    '--sd-box': theme.box,
    '--sd-given': theme.given,
    '--sd-entry': theme.entry,
    '--sd-note': theme.note,
    '--sd-related': theme.related,
    '--sd-same': theme.same,
    '--sd-selected': theme.selected,
    '--sd-selected-ink': theme.selectedInk,
    '--sd-wrong': theme.wrong,
    '--sd-wrong-ink': theme.wrongInk,
    '--sd-hint': theme.hint,
  } as CSSProperties
}

export function padStyle(theme: PadTheme): CSSProperties {
  return {
    '--sd-pad-key': theme.key,
    '--sd-pad-ink': theme.ink,
    '--sd-pad-border': theme.border,
    '--sd-pad-shadow': theme.shadow,
    '--sd-pad-radius': theme.radius,
    '--sd-pad-active': theme.active,
    '--sd-pad-active-ink': theme.activeInk,
  } as CSSProperties
}
