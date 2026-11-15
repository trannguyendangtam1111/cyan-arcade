import { describe, expect, it } from 'vitest'
import { BEGINNER, EXPERT, INTERMEDIATE, neighbours } from '../engine/minesweeperEngine'
import {
  boardWidthPx,
  defaultView,
  engineIndex,
  fitCellPx,
  isLargeBoard,
  moveFrom,
  orientationFor,
  visualPosition,
  visualShape,
} from './boardLayout'

describe('which layout a board gets', () => {
  it('keeps Classic’s 9 × 9 as it was and gives the bigger boards the large layout', () => {
    expect(isLargeBoard(BEGINNER)).toBe(false)
    expect(isLargeBoard(INTERMEDIATE)).toBe(true)
    expect(isLargeBoard(EXPERT)).toBe(true)
  })

  it('stands Expert up in portrait on a narrow screen, and nothing else', () => {
    expect(orientationFor(EXPERT, 343)).toBe('portrait')
    expect(orientationFor(EXPERT, 639)).toBe('portrait')
    expect(orientationFor(EXPERT, 640)).toBe('landscape')
    expect(orientationFor(EXPERT, 1200)).toBe('landscape')
    // Until the width is known, and for boards no wider than they are tall.
    expect(orientationFor(EXPERT, null)).toBe('landscape')
    expect(orientationFor(INTERMEDIATE, 343)).toBe('landscape')
    expect(orientationFor(BEGINNER, 343)).toBe('landscape')
  })

  it('fits a board when its cells would be big enough to tap, and zooms it otherwise', () => {
    // A phone (343 px for the board): 16 columns fitted are under 19 px.
    expect(fitCellPx(343, 16)).toBeCloseTo(18.81, 2)
    expect(defaultView(16, 343)).toBe('zoom')
    // A tablet: Intermediate fits (about 42 px); Expert in landscape does not (about 22 px).
    expect(defaultView(16, 720)).toBe('fit')
    expect(defaultView(30, 720)).toBe('zoom')
    // A desktop column of 900 px fits Expert at about 28 px.
    expect(fitCellPx(900, 30)).toBeCloseTo(27.67, 2)
    expect(defaultView(30, 900)).toBe('fit')
    expect(defaultView(30, null)).toBe('fit')
  })

  it('knows how wide a board is drawn', () => {
    // 30 cells of 36 px, 29 gaps of 2 px and 6 px of padding each side.
    expect(boardWidthPx(30, 36)).toBe(1150)
    expect(boardWidthPx(16, 44)).toBe(746)
  })
})

describe('portrait Expert', () => {
  it('is drawn 30 rows tall and 16 columns wide, its engine board still 16 × 30', () => {
    expect(visualShape(EXPERT, 'portrait')).toEqual({ rows: 30, columns: 16 })
    expect(visualShape(EXPERT, 'landscape')).toEqual({ rows: 16, columns: 30 })
  })

  it('draws engine row r, column c at row c, column r', () => {
    // The corners: top left stays, the engine's top right (cell 29) goes to the bottom left.
    expect(engineIndex(EXPERT, 'portrait', 0, 0)).toBe(0)
    expect(engineIndex(EXPERT, 'portrait', 29, 0)).toBe(29)
    expect(engineIndex(EXPERT, 'portrait', 0, 15)).toBe(450)
    expect(engineIndex(EXPERT, 'portrait', 29, 15)).toBe(479)
    // Engine row 3, column 7 (cell 97) is drawn at row 7, column 3.
    expect(visualPosition(EXPERT, 'portrait', 97)).toEqual({ row: 7, column: 3 })
    expect(engineIndex(EXPERT, 'portrait', 7, 3)).toBe(97)
  })

  it('maps every drawn cell to one engine cell and back', () => {
    for (const orientation of ['portrait', 'landscape'] as const) {
      const shape = visualShape(EXPERT, orientation)
      const seen = new Set<number>()
      for (let row = 0; row < shape.rows; row++) {
        for (let column = 0; column < shape.columns; column++) {
          const index = engineIndex(EXPERT, orientation, row, column)
          expect(visualPosition(EXPERT, orientation, index)).toEqual({ row, column })
          seen.add(index)
        }
      }
      expect(seen.size).toBe(480)
      expect(Math.min(...seen)).toBe(0)
      expect(Math.max(...seen)).toBe(479)
    }
  })

  it('keeps every cell’s neighbours its neighbours, so a flood looks the same', () => {
    for (let index = 0; index < 480; index++) {
      const at = visualPosition(EXPERT, 'portrait', index)
      const drawnAround = neighbours({ rows: 30, columns: 16, mines: 0 }, at.row * 16 + at.column).map((drawn) =>
        engineIndex(EXPERT, 'portrait', Math.floor(drawn / 16), drawn % 16),
      )
      expect(drawnAround.sort((a, b) => a - b)).toEqual(neighbours(EXPERT, index).sort((a, b) => a - b))
    }
  })
})

describe('moving the keyboard’s cell', () => {
  const shape = { rows: 30, columns: 16 }

  it('goes one cell at a time and stops at the edges', () => {
    expect(moveFrom(shape, { row: 5, column: 5 }, 'ArrowUp')).toEqual({ row: 4, column: 5 })
    expect(moveFrom(shape, { row: 5, column: 5 }, 'ArrowDown')).toEqual({ row: 6, column: 5 })
    expect(moveFrom(shape, { row: 5, column: 5 }, 'ArrowLeft')).toEqual({ row: 5, column: 4 })
    expect(moveFrom(shape, { row: 5, column: 5 }, 'ArrowRight')).toEqual({ row: 5, column: 6 })
    expect(moveFrom(shape, { row: 0, column: 0 }, 'ArrowUp')).toEqual({ row: 0, column: 0 })
    expect(moveFrom(shape, { row: 0, column: 0 }, 'ArrowLeft')).toEqual({ row: 0, column: 0 })
    expect(moveFrom(shape, { row: 29, column: 15 }, 'ArrowDown')).toEqual({ row: 29, column: 15 })
    expect(moveFrom(shape, { row: 29, column: 15 }, 'ArrowRight')).toEqual({ row: 29, column: 15 })
  })

  it('jumps to the ends of the row, or of the board with Ctrl, and ignores other keys', () => {
    expect(moveFrom(shape, { row: 5, column: 5 }, 'Home')).toEqual({ row: 5, column: 0 })
    expect(moveFrom(shape, { row: 5, column: 5 }, 'End')).toEqual({ row: 5, column: 15 })
    expect(moveFrom(shape, { row: 5, column: 5 }, 'Home', true)).toEqual({ row: 0, column: 0 })
    expect(moveFrom(shape, { row: 5, column: 5 }, 'End', true)).toEqual({ row: 29, column: 15 })
    expect(moveFrom(shape, { row: 5, column: 5 }, 'a')).toBeNull()
    expect(moveFrom(shape, { row: 5, column: 5 }, 'Tab')).toBeNull()
  })
})
