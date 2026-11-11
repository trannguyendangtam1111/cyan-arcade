import type { Cell } from '../types/minesweeperTypes'

/**
 * What a screen reader hears for a cell, at its row and column as drawn (counted from 1), so the
 * words match where the arrow keys go.
 */
export function cellLabel(cell: Cell, row: number, column: number, over: boolean): string {
  const where = `Row ${row + 1}, column ${column + 1}`
  if (cell.revealed && cell.mine) return `${where}: mine`
  if (cell.revealed) return `${where}: ${cell.adjacent === 0 ? 'empty' : `${cell.adjacent} nearby`}`
  if (over && cell.mine) return `${where}: mine`
  if (cell.flagged) return `${where}: flagged`
  return `${where}: hidden`
}
