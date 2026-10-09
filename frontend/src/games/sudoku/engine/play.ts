import { bit, CELLS, peersOf } from './grid'

/**
 * The board as the player edits it: digits, pencil marks and which cells are locked (clues and
 * digits a hint revealed), with undo and redo. Pure: every edit returns a new state and the changes
 * it made, which undo plays backwards. Which digits are right is the server's to say; this only keeps
 * the player's board.
 */

export interface PlayBoard {
  values: number[]
  /** Pencil marks per cell, as a bit mask (bit d: digit d). */
  notes: number[]
  locked: boolean[]
}

/** One cell before and after an edit. */
export interface CellChange {
  cell: number
  before: { value: number; notes: number }
  after: { value: number; notes: number }
}

/** One edit: everything it changed, so it can be undone and redone as a whole. */
export interface Edit {
  changes: CellChange[]
}

export interface History {
  past: Edit[]
  future: Edit[]
}

/** Undo steps kept: enough for any game, and memory never grows without end. */
export const HISTORY_LIMIT = 200

export const emptyHistory = (): History => ({ past: [], future: [] })

export function createBoard(givens: readonly number[], values: readonly number[], revealed: readonly number[], notes?: readonly number[]): PlayBoard {
  const shown = new Set(revealed)
  return {
    values: [...values],
    notes: notes ? values.map((value, cell) => (value === 0 ? (notes[cell] ?? 0) : 0)) : Array<number>(CELLS).fill(0),
    locked: givens.map((given, cell) => given !== 0 || shown.has(cell)),
  }
}

export interface EditOptions {
  /** Placing a digit removes it from the notes of the cells that see it. */
  autoRemoveNotes: boolean
}

/**
 * Enters a digit in a cell: as its value, which clears the cell's notes; or, in notes mode, toggles
 * it as a pencil mark of an empty cell. Locked cells are left alone.
 * @returns the edit, or `null` when nothing changes
 */
export function enterDigit(board: PlayBoard, cell: number, digit: number, notesMode: boolean, options: EditOptions): Edit | null {
  if (board.locked[cell] || digit < 1 || digit > 9) return null
  if (notesMode) {
    if (board.values[cell] !== 0) return null
    const notes = board.notes[cell] ^ bit(digit)
    return { changes: [change(board, cell, board.values[cell], notes)] }
  }
  if (board.values[cell] === digit) return null
  const changes = [change(board, cell, digit, 0)]
  if (options.autoRemoveNotes) {
    for (const peer of peersOf(cell)) {
      if (board.values[peer] === 0 && (board.notes[peer] & bit(digit)) !== 0) {
        changes.push(change(board, peer, 0, board.notes[peer] & ~bit(digit)))
      }
    }
  }
  return { changes }
}

/** Clears a cell's digit, or its notes when it has no digit. Locked cells are left alone. */
export function eraseCell(board: PlayBoard, cell: number): Edit | null {
  if (board.locked[cell]) return null
  if (board.values[cell] === 0 && board.notes[cell] === 0) return null
  return { changes: [change(board, cell, 0, 0)] }
}

/** Clears every digit and note the player entered: clues and revealed digits stay. */
export function clearBoard(board: PlayBoard): Edit | null {
  const changes: CellChange[] = []
  for (let cell = 0; cell < CELLS; cell++) {
    if (!board.locked[cell] && (board.values[cell] !== 0 || board.notes[cell] !== 0)) changes.push(change(board, cell, 0, 0))
  }
  return changes.length ? { changes } : null
}

/** Removes candidates from the notes, e.g. those a hint's reasoning rules out. */
export function removeNotes(board: PlayBoard, eliminations: readonly { cell: number; digit: number }[]): Edit | null {
  const notes = [...board.notes]
  for (const { cell, digit } of eliminations) notes[cell] &= ~bit(digit)
  const changes: CellChange[] = []
  notes.forEach((mask, cell) => {
    if (mask !== board.notes[cell]) changes.push(change(board, cell, board.values[cell], mask))
  })
  return changes.length ? { changes } : null
}

export function applyEdit(board: PlayBoard, edit: Edit, direction: 'forward' | 'back' = 'forward'): PlayBoard {
  const values = [...board.values]
  const notes = [...board.notes]
  const ordered = direction === 'forward' ? edit.changes : [...edit.changes].reverse()
  for (const { cell, before, after } of ordered) {
    // A cell locked since (a hint revealed it) keeps its digit whatever the history says.
    if (board.locked[cell]) continue
    const target = direction === 'forward' ? after : before
    values[cell] = target.value
    notes[cell] = target.notes
  }
  return { ...board, values, notes }
}

/** Records an edit: it can be undone, and anything undone before it can no longer be redone. */
export function record(history: History, edit: Edit): History {
  return { past: [...history.past, edit].slice(-HISTORY_LIMIT), future: [] }
}

/** Undoes the last edit. @returns the board and history after, or `null` with nothing to undo */
export function undo(board: PlayBoard, history: History): { board: PlayBoard; history: History; edit: Edit } | null {
  const edit = history.past.at(-1)
  if (!edit) return null
  return { board: applyEdit(board, edit, 'back'), history: { past: history.past.slice(0, -1), future: [edit, ...history.future] }, edit }
}

export function redo(board: PlayBoard, history: History): { board: PlayBoard; history: History; edit: Edit } | null {
  const edit = history.future[0]
  if (!edit) return null
  return { board: applyEdit(board, edit), history: { past: [...history.past, edit].slice(-HISTORY_LIMIT), future: history.future.slice(1) }, edit }
}

/**
 * The value changes an edit makes on the board, in the server's terms (`digit` 0 clears): what has
 * to be sent. Notes stay in the browser.
 */
export function valueMoves(before: PlayBoard, after: PlayBoard): { cell: number; digit: number }[] {
  const moves: { cell: number; digit: number }[] = []
  for (let cell = 0; cell < CELLS; cell++) {
    if (before.values[cell] !== after.values[cell]) moves.push({ cell, digit: after.values[cell] })
  }
  return moves
}

/** Locks a cell revealed by a hint and puts its digit in, clearing its notes. */
export function revealCell(board: PlayBoard, cell: number, digit: number): PlayBoard {
  const values = [...board.values]
  const notes = [...board.notes]
  const locked = [...board.locked]
  values[cell] = digit
  notes[cell] = 0
  locked[cell] = true
  return { values, notes, locked }
}

function change(board: PlayBoard, cell: number, value: number, notes: number): CellChange {
  return { cell, before: { value: board.values[cell], notes: board.notes[cell] }, after: { value, notes } }
}
