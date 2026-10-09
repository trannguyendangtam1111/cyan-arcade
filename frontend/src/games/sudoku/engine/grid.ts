/**
 * The 9×9 board in the browser: 81 cells in reading order, each a digit 1–9 or 0 when empty.
 * Candidate and note sets are bit masks (bit d set: digit d). These are the same rules the server
 * plays by; the server's word is final on what is right.
 */

export const SIZE = 9
export const CELLS = 81
export const ALL_DIGITS = 0b11_1111_1110
export const DIGITS = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const

export const rowOf = (cell: number) => Math.floor(cell / SIZE)
export const colOf = (cell: number) => cell % SIZE
export const boxOf = (cell: number) => Math.floor(rowOf(cell) / 3) * 3 + Math.floor(colOf(cell) / 3)

export const bit = (digit: number) => 1 << digit

/** Whether two different cells share a row, column or box. */
export function sees(a: number, b: number): boolean {
  return a !== b && (rowOf(a) === rowOf(b) || colOf(a) === colOf(b) || boxOf(a) === boxOf(b))
}

const PEERS: number[][] = Array.from({ length: CELLS }, (_, cell) =>
  Array.from({ length: CELLS }, (_, other) => other).filter((other) => sees(cell, other)),
)

/** The 20 cells that share a house with this one. */
export function peersOf(cell: number): readonly number[] {
  return PEERS[cell]
}

/** Reads 81 characters (`0` or `.` for empty) into digits. */
export function parseBoard(text: string): number[] {
  if (text.length !== CELLS) throw new Error('A board has 81 cells')
  return Array.from(text, (ch) => (ch === '.' ? 0 : Number(ch)))
}

export function formatBoard(values: readonly number[]): string {
  return values.join('')
}

/** Cells whose digit repeats in their row, column or box. Empty cells never conflict. */
export function conflicts(values: readonly number[]): Set<number> {
  const found = new Set<number>()
  for (let cell = 0; cell < CELLS; cell++) {
    const value = values[cell]
    if (value === 0) continue
    if (PEERS[cell].some((peer) => values[peer] === value)) found.add(cell)
  }
  return found
}

/** Digits this empty cell may still take; 0 for a filled one. */
export function candidates(values: readonly number[], cell: number): number {
  if (values[cell] !== 0) return 0
  let seen = 0
  for (const peer of PEERS[cell]) seen |= bit(values[peer])
  return ALL_DIGITS & ~seen
}

export function digitsOf(mask: number): number[] {
  return DIGITS.filter((digit) => (mask & bit(digit)) !== 0)
}

/** How many times each digit (index 1–9) is on the board. */
export function digitCounts(values: readonly number[]): number[] {
  const counts = Array<number>(10).fill(0)
  for (const value of values) counts[value]++
  counts[0] = 0
  return counts
}

export function isComplete(values: readonly number[]): boolean {
  return values.every((value) => value !== 0) && conflicts(values).size === 0
}

/** The cell one step away, wrapping around the edges. */
export function stepFrom(cell: number, direction: 'up' | 'down' | 'left' | 'right'): number {
  const row = rowOf(cell)
  const col = colOf(cell)
  switch (direction) {
    case 'up':
      return ((row + SIZE - 1) % SIZE) * SIZE + col
    case 'down':
      return ((row + 1) % SIZE) * SIZE + col
    case 'left':
      return row * SIZE + ((col + SIZE - 1) % SIZE)
    case 'right':
      return row * SIZE + ((col + 1) % SIZE)
  }
}

/** "Row 3, column 4", as a screen reader says it. */
export function cellLabel(cell: number): string {
  return `Row ${rowOf(cell) + 1}, column ${colOf(cell) + 1}`
}
