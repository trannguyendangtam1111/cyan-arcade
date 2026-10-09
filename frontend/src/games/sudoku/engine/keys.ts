/** What a key press means in Sudoku. Pure: the caller hands over the event's fields. */

export type Direction = 'up' | 'down' | 'left' | 'right'

export type KeyCommand =
  | { kind: 'digit'; digit: number; note: boolean }
  | { kind: 'erase' }
  | { kind: 'move'; direction: Direction }
  | { kind: 'notes' }
  | { kind: 'hint' }
  | { kind: 'undo' }
  | { kind: 'redo' }
  | { kind: 'pause' }

export interface KeyInput {
  key: string
  code?: string
  ctrlKey?: boolean
  metaKey?: boolean
  shiftKey?: boolean
  altKey?: boolean
}

const ARROWS: Record<string, Direction> = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' }

/**
 * Digits, arrows and erasing always work. With `shortcuts` on, so do N (notes), H (hint), Escape
 * (pause), Ctrl+Z (undo) and Ctrl+Y or Ctrl+Shift+Z (redo). Shift with a digit toggles a pencil mark.
 * @returns `null` for a key Sudoku does not use, which is then left to the browser
 */
export function keyCommand(input: KeyInput, shortcuts: boolean): KeyCommand | null {
  const control = Boolean(input.ctrlKey || input.metaKey)
  if (input.altKey) return null
  if (control) {
    if (!shortcuts) return null
    const key = input.key.toLowerCase()
    if (key === 'z') return input.shiftKey ? { kind: 'redo' } : { kind: 'undo' }
    if (key === 'y') return { kind: 'redo' }
    return null
  }
  const digit = digitOf(input)
  if (digit !== null) return digit === 0 ? { kind: 'erase' } : { kind: 'digit', digit, note: Boolean(input.shiftKey) }
  if (input.key === 'Backspace' || input.key === 'Delete') return { kind: 'erase' }
  if (input.key in ARROWS) return { kind: 'move', direction: ARROWS[input.key] }
  if (!shortcuts) return null
  switch (input.key.toLowerCase()) {
    case 'n':
      return { kind: 'notes' }
    case 'h':
      return { kind: 'hint' }
    case 'escape':
      return { kind: 'pause' }
    default:
      return null
  }
}

/** The digit of a digit key, with or without Shift (which turns "1" into "!" on most layouts). */
function digitOf(input: KeyInput): number | null {
  if (/^[0-9]$/.test(input.key)) return Number(input.key)
  const code = input.code ?? ''
  const match = /^(?:Digit|Numpad)([0-9])$/.exec(code)
  return match ? Number(match[1]) : null
}
