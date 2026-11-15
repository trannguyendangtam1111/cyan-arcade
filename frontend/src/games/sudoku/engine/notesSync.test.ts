import { describe, expect, it } from 'vitest'
import { fromNoteCells, mergeNotes, NO_NOTES, sameNotes, toNoteCells } from './notesSync'

/** A mask per cell from `{ cell: digits }`. */
const masks = (notes: Record<number, number[]>) => Array.from({ length: 81 }, (_, index) => (notes[index] ?? []).reduce((mask, digit) => mask | (1 << digit), 0))

describe('notes as the server keeps them', () => {
  it('lists the cells with marks, in order, digits ascending, and reads them back', () => {
    const notes = masks({ 0: [9, 1], 40: [5], 80: [1, 2, 3, 4, 5, 6, 7, 8, 9] })
    const cells = toNoteCells(notes)
    expect(cells).toEqual([
      { cell: 0, digits: [1, 9] },
      { cell: 40, digits: [5] },
      { cell: 80, digits: [1, 2, 3, 4, 5, 6, 7, 8, 9] },
    ])
    expect(fromNoteCells(cells)).toEqual(notes)
    expect(toNoteCells(NO_NOTES)).toEqual([])
    expect(fromNoteCells([])).toEqual([...NO_NOTES])
  })

  it('leaves out anything outside the board or 1-9', () => {
    expect(fromNoteCells([{ cell: 81, digits: [1] }, { cell: -1, digits: [1] }, { cell: 3, digits: [0, 10, 4] }])).toEqual(masks({ 3: [4] }))
  })

  it('compares marks cell by cell', () => {
    expect(sameNotes(masks({ 2: [1] }), masks({ 2: [1] }))).toBe(true)
    expect(sameNotes(masks({ 2: [1] }), masks({ 2: [1, 2] }))).toBe(false)
    expect(sameNotes(NO_NOTES, masks({}))).toBe(true)
  })
})

describe("merging two devices' marks", () => {
  const base = masks({ 0: [1], 1: [2], 2: [3] })

  it("takes the server's where only it changed, and this device's where only it did", () => {
    const mine = masks({ 0: [1], 1: [2, 7], 2: [3] })
    const server = masks({ 0: [1, 5], 1: [2], 2: [3], 9: [4] })
    expect(mergeNotes(base, mine, server)).toEqual(masks({ 0: [1, 5], 1: [2, 7], 2: [3], 9: [4] }))
  })

  it("keeps the server's, the newer, where both changed a cell", () => {
    const mine = masks({ 0: [1, 2], 1: [2], 2: [] })
    const server = masks({ 0: [9], 1: [2], 2: [3, 4] })
    expect(mergeNotes(base, mine, server)).toEqual(masks({ 0: [9], 1: [2], 2: [3, 4] }))
  })

  it('is either side unchanged when the other is the base', () => {
    const changed = masks({ 5: [5] })
    expect(mergeNotes(base, base, changed)).toEqual(changed)
    expect(mergeNotes(base, changed, base)).toEqual(changed)
    expect(mergeNotes(NO_NOTES, changed, NO_NOTES)).toEqual(changed)
  })
})
