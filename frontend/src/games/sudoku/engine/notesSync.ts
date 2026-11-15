import type { NoteCellView } from '../types/sudokuTypes'
import { bit, CELLS } from './grid'

/**
 * Pencil marks as the server keeps them, and how two devices' marks come together. Pure: the board
 * keeps a bit mask per cell (bit d: digit d); the server lists the cells that have marks, digits
 * ascending.
 */

export const NO_NOTES: readonly number[] = Object.freeze(Array<number>(CELLS).fill(0))

/** The cells with marks, in order, as the server takes them. */
export function toNoteCells(notes: readonly number[]): NoteCellView[] {
  const cells: NoteCellView[] = []
  for (let cell = 0; cell < CELLS; cell++) {
    const digits = [1, 2, 3, 4, 5, 6, 7, 8, 9].filter((digit) => (notes[cell] & bit(digit)) !== 0)
    if (digits.length) cells.push({ cell, digits })
  }
  return cells
}

/** The server's cells as a mask per cell. Anything outside the board or 1-9 is left out. */
export function fromNoteCells(cells: readonly NoteCellView[]): number[] {
  const notes = Array<number>(CELLS).fill(0)
  for (const { cell, digits } of cells) {
    if (!Number.isInteger(cell) || cell < 0 || cell >= CELLS) continue
    for (const digit of digits) {
      if (Number.isInteger(digit) && digit >= 1 && digit <= 9) notes[cell] |= bit(digit)
    }
  }
  return notes
}

export function sameNotes(a: readonly number[], b: readonly number[]): boolean {
  for (let cell = 0; cell < CELLS; cell++) {
    if ((a[cell] ?? 0) !== (b[cell] ?? 0)) return false
  }
  return true
}

/**
 * This device's marks and the server's newer ones, together, cell by cell, from the marks both last
 * agreed on (`base`): a cell only one side changed takes that side's marks; a cell both changed takes
 * the server's, so newer marks saved elsewhere are never silently overwritten.
 */
export function mergeNotes(base: readonly number[], mine: readonly number[], server: readonly number[]): number[] {
  return Array.from({ length: CELLS }, (_, cell) => {
    const before = base[cell] ?? 0
    const local = mine[cell] ?? 0
    const remote = server[cell] ?? 0
    return local === before ? remote : remote === before ? local : remote
  })
}
