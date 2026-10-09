import { describe, expect, it } from 'vitest'
import { bit, candidates, conflicts, digitCounts, digitsOf, isComplete, parseBoard, peersOf, stepFrom } from './grid'
import { keyCommand } from './keys'
import { clearBoard, createBoard, emptyHistory, enterDigit, eraseCell, HISTORY_LIMIT, record, redo, removeNotes, revealCell, undo, valueMoves, applyEdit, type PlayBoard } from './play'

const SOLVED = '534678912672195348198342567859761423426853791713924856961537284287419635345286179'
const PUZZLE = '530070000600195000098000060800060003400803001700020006060000280000419005000080079'
const GIVENS = parseBoard(PUZZLE)

const fresh = (): PlayBoard => createBoard(GIVENS, GIVENS, [])
const OPTIONS = { autoRemoveNotes: true }

/** r1c3: empty in the puzzle, 4 in the solution. */
const CELL = 2

describe('the grid', () => {
  it('knows a valid completed board', () => {
    expect(isComplete(parseBoard(SOLVED))).toBe(true)
    expect(conflicts(parseBoard(SOLVED)).size).toBe(0)
    expect(isComplete(GIVENS)).toBe(false)
  })

  it('finds repeats in a row, a column and a box', () => {
    const row = parseBoard(SOLVED)
    row[1] = 5
    expect([...conflicts(row)]).toEqual(expect.arrayContaining([0, 1]))
    expect(isComplete(row)).toBe(false)

    const column = Array<number>(81).fill(0)
    column[0] = 7
    column[72] = 7
    expect([...conflicts(column)]).toEqual([0, 72])

    const box = Array<number>(81).fill(0)
    box[0] = 3
    box[20] = 3
    expect([...conflicts(box)]).toEqual([0, 20])
  })

  it('works out a cell\'s candidates from its row, column and box', () => {
    expect(digitsOf(candidates(GIVENS, CELL))).toEqual([1, 2, 4])
    expect(candidates(GIVENS, 0)).toBe(0)
    expect(peersOf(40)).toHaveLength(20)
  })

  it('counts digits and moves around the edges', () => {
    expect(digitCounts(parseBoard(SOLVED)).slice(1)).toEqual([9, 9, 9, 9, 9, 9, 9, 9, 9])
    expect(stepFrom(0, 'left')).toBe(8)
    expect(stepFrom(0, 'up')).toBe(72)
    expect(stepFrom(80, 'right')).toBe(72)
    expect(stepFrom(40, 'down')).toBe(49)
  })
})

describe('editing the board', () => {
  it('enters a digit and never touches a clue', () => {
    const board = fresh()
    const edit = enterDigit(board, CELL, 4, false, OPTIONS)
    expect(edit).not.toBeNull()
    expect(applyEdit(board, edit!).values[CELL]).toBe(4)
    expect(enterDigit(board, 0, 9, false, OPTIONS)).toBeNull()
    expect(enterDigit(board, 0, 9, true, OPTIONS)).toBeNull()
    expect(eraseCell(board, 0)).toBeNull()
  })

  it('toggles pencil marks in notes mode, several per cell, and a digit clears them', () => {
    let board = fresh()
    board = applyEdit(board, enterDigit(board, CELL, 1, true, OPTIONS)!)
    board = applyEdit(board, enterDigit(board, CELL, 4, true, OPTIONS)!)
    expect(digitsOf(board.notes[CELL])).toEqual([1, 4])
    board = applyEdit(board, enterDigit(board, CELL, 1, true, OPTIONS)!)
    expect(digitsOf(board.notes[CELL])).toEqual([4])
    board = applyEdit(board, enterDigit(board, CELL, 4, false, OPTIONS)!)
    expect(board.values[CELL]).toBe(4)
    expect(board.notes[CELL]).toBe(0)
    // No notes on a filled cell.
    expect(enterDigit(board, CELL, 2, true, OPTIONS)).toBeNull()
  })

  it('removes a placed digit from the notes of the cells that see it, when asked to', () => {
    let board = fresh()
    // r1c4 (cell 3) and r9c6 (cell 77) both note a 4; only r1c4 sees r1c3.
    board = applyEdit(board, enterDigit(board, 3, 4, true, OPTIONS)!)
    board = applyEdit(board, enterDigit(board, 77, 4, true, OPTIONS)!)
    const withAuto = applyEdit(board, enterDigit(board, CELL, 4, false, { autoRemoveNotes: true })!)
    expect(withAuto.notes[3]).toBe(0)
    expect(withAuto.notes[77]).toBe(bit(4))
    const without = applyEdit(board, enterDigit(board, CELL, 4, false, { autoRemoveNotes: false })!)
    expect(without.notes[3]).toBe(bit(4))
  })

  it('erases a digit, then the notes', () => {
    let board = fresh()
    board = applyEdit(board, enterDigit(board, CELL, 7, false, OPTIONS)!)
    board = applyEdit(board, eraseCell(board, CELL)!)
    expect(board.values[CELL]).toBe(0)
    expect(eraseCell(board, CELL)).toBeNull()
  })

  it('undoes and redoes every change of an edit exactly, notes included', () => {
    let board = fresh()
    let history = emptyHistory()
    const step = (edit: ReturnType<typeof enterDigit>) => {
      board = applyEdit(board, edit!)
      history = record(history, edit!)
    }
    step(enterDigit(board, 3, 4, true, OPTIONS))
    const beforePlacing = board
    step(enterDigit(board, CELL, 4, false, OPTIONS))
    expect(board.notes[3]).toBe(0)

    const undone = undo(board, history)!
    expect(undone.board.values).toEqual(beforePlacing.values)
    expect(undone.board.notes).toEqual(beforePlacing.notes)
    expect(valueMoves(board, undone.board)).toEqual([{ cell: CELL, digit: 0 }])

    const redone = redo(undone.board, undone.history)!
    expect(redone.board.values).toEqual(board.values)
    expect(redone.board.notes).toEqual(board.notes)
    expect(redo(redone.board, redone.history)).toBeNull()

    // A new edit after an undo drops what could have been redone.
    const branched = record(undone.history, enterDigit(undone.board, 5, 2, false, OPTIONS)!)
    expect(branched.future).toEqual([])
    expect(undo(fresh(), emptyHistory())).toBeNull()
  })

  it('keeps a bounded history', () => {
    let board = fresh()
    let history = emptyHistory()
    for (let index = 0; index < HISTORY_LIMIT + 50; index++) {
      const edit = enterDigit(board, CELL, (index % 9) + 1, true, OPTIONS)!
      board = applyEdit(board, edit)
      history = record(history, edit)
    }
    expect(history.past).toHaveLength(HISTORY_LIMIT)
  })

  it('never undoes a revealed cell', () => {
    let board = fresh()
    let history = emptyHistory()
    const edit = enterDigit(board, CELL, 7, false, OPTIONS)!
    board = applyEdit(board, edit)
    history = record(history, edit)
    board = revealCell(board, CELL, 4)
    const undone = undo(board, history)!
    expect(undone.board.values[CELL]).toBe(4)
    expect(valueMoves(board, undone.board)).toEqual([])
  })

  it('clears the player\'s digits and notes but no clue, and removes ruled-out notes', () => {
    let board = fresh()
    board = applyEdit(board, enterDigit(board, CELL, 4, false, OPTIONS)!)
    board = applyEdit(board, enterDigit(board, 3, 6, true, OPTIONS)!)
    const cleared = applyEdit(board, clearBoard(board)!)
    expect(cleared.values).toEqual(GIVENS)
    expect(cleared.notes.every((mask) => mask === 0)).toBe(true)
    expect(clearBoard(cleared)).toBeNull()

    const trimmed = applyEdit(board, removeNotes(board, [{ cell: 3, digit: 6 }])!)
    expect(trimmed.notes[3]).toBe(0)
    expect(removeNotes(trimmed, [{ cell: 3, digit: 6 }])).toBeNull()
  })
})

describe('keys', () => {
  it('maps digits, erasing and arrows always', () => {
    expect(keyCommand({ key: '5' }, false)).toEqual({ kind: 'digit', digit: 5, note: false })
    expect(keyCommand({ key: '%', code: 'Digit5', shiftKey: true }, true)).toEqual({ kind: 'digit', digit: 5, note: true })
    expect(keyCommand({ key: '3', code: 'Numpad3' }, true)).toEqual({ kind: 'digit', digit: 3, note: false })
    expect(keyCommand({ key: 'Backspace' }, false)).toEqual({ kind: 'erase' })
    expect(keyCommand({ key: 'Delete' }, true)).toEqual({ kind: 'erase' })
    expect(keyCommand({ key: '0' }, true)).toEqual({ kind: 'erase' })
    expect(keyCommand({ key: 'ArrowLeft' }, false)).toEqual({ kind: 'move', direction: 'left' })
  })

  it('maps the shortcuts only when they are on', () => {
    expect(keyCommand({ key: 'n' }, true)).toEqual({ kind: 'notes' })
    expect(keyCommand({ key: 'H' }, true)).toEqual({ kind: 'hint' })
    expect(keyCommand({ key: 'Escape' }, true)).toEqual({ kind: 'pause' })
    expect(keyCommand({ key: 'z', ctrlKey: true }, true)).toEqual({ kind: 'undo' })
    expect(keyCommand({ key: 'Z', ctrlKey: true, shiftKey: true }, true)).toEqual({ kind: 'redo' })
    expect(keyCommand({ key: 'y', metaKey: true }, true)).toEqual({ kind: 'redo' })
    expect(keyCommand({ key: 'n' }, false)).toBeNull()
    expect(keyCommand({ key: 'z', ctrlKey: true }, false)).toBeNull()
    expect(keyCommand({ key: 'r', ctrlKey: true }, true)).toBeNull()
    expect(keyCommand({ key: 'q' }, true)).toBeNull()
  })
})
