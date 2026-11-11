import { fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { EXPERT, INTERMEDIATE, createMinesweeper, reveal, toggleFlag, type MinesweeperState } from '../engine/minesweeperEngine'
import MinesweeperGame from '../MinesweeperGame'
import { MinesweeperBoardPreview } from '../preview/MinesweeperBoardPreview'
import { cellLabel } from './cellLabel'

// Counts how often a cell draws: every drawn cell asks for its label once.
vi.mock('./cellLabel', async (importOriginal) => {
  const original = await importOriginal<typeof import('./cellLabel')>()
  return { ...original, cellLabel: vi.fn(original.cellLabel) }
})

const SEED = 20261106

const grid = () => screen.getByRole('grid', { name: 'Minefield' })
const cells = () => within(grid()).getAllByRole('gridcell')
const rows = () => within(grid()).getAllByRole('row')
/** The cell drawn at this row and column. */
const drawnAt = (row: number, column: number) => within(rows()[row]).getAllByRole('gridcell')[column]
/** The engine cell a drawn button stands for. */
const indexOf = (button: HTMLElement) => Number(button.dataset.index)
/** The button of an engine cell, wherever it is drawn. */
const engineCell = (index: number) => cells().find((button) => indexOf(button) === index) as HTMLElement
const isHidden = (button: HTMLElement) => /: (hidden|flagged)$/.test(button.getAttribute('aria-label') ?? '')
const status = () => screen.getByRole('status', { name: 'Preview status' }).textContent
const viewport = () => screen.getByTestId('minefield-viewport')
const viewButton = (name: string) => within(screen.getByRole('group', { name: 'Board view' })).getByRole('button', { name })

/** Every drawn cell shows what the engine's state says about its own cell. */
function expectBoardToShow(state: MinesweeperState) {
  for (const button of cells()) {
    const cell = state.cells[indexOf(button)]
    expect(isHidden(button), `cell ${indexOf(button)}`).toBe(!cell.revealed)
    expect(/: flagged$/.test(button.getAttribute('aria-label') ?? ''), `flag on ${indexOf(button)}`).toBe(cell.flagged)
  }
}

/** Makes the board's frame this wide, as a browser's `ResizeObserver` would report it. */
function frameWidth(width: number) {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      report: ResizeObserverCallback
      constructor(report: ResizeObserverCallback) {
        this.report = report
      }
      observe(element: Element) {
        this.report([{ target: element, contentRect: { width } } as unknown as ResizeObserverEntry], this as unknown as ResizeObserver)
      }
      unobserve() {}
      disconnect() {}
    },
  )
}

afterEach(() => vi.unstubAllGlobals())

describe('Classic’s 9 × 9 board', () => {
  it('keeps its layout: the same frame, nine columns of fluid square cells, no Fit or Zoom', () => {
    render(<MinesweeperGame onGameStart={vi.fn()} onGameOver={vi.fn()} />)

    expect(grid()).toHaveClass('grid w-full gap-1 rounded-2xl bg-rose-100 p-2 shadow-soft ring-4 ring-rose-200 sm:gap-1.5 sm:p-3')
    expect(grid().style.gridTemplateColumns).toBe('repeat(9, minmax(0, 1fr))')
    expect(rows()).toHaveLength(9)
    expect(cells()).toHaveLength(81)
    expect(cells()[0]).toHaveClass('rounded-lg', 'text-[min(5.5vw,1.6rem)]', 'aspect-square', 'shadow-[0_3px_0_0_var(--color-rose-700)]')
    expect(screen.queryByRole('group', { name: 'Board view' })).not.toBeInTheDocument()
    expect(screen.queryByTestId('minefield-viewport')).not.toBeInTheDocument()
    // Its frame is still at most 30rem wide.
    expect(grid().parentElement).toHaveClass('max-w-[30rem]')
  })

  it('is one Tab stop, walked with the arrow keys; Enter reveals whatever the tool', () => {
    const onGameStart = vi.fn()
    render(<MinesweeperGame onGameStart={onGameStart} onGameOver={vi.fn()} />)
    expect(cells().filter((button) => button.tabIndex === 0)).toEqual([cells()[0]])

    cells()[0].focus()
    for (let step = 0; step < 4; step++) fireEvent.keyDown(document.activeElement as Element, { key: 'ArrowRight' })
    for (let step = 0; step < 4; step++) fireEvent.keyDown(document.activeElement as Element, { key: 'ArrowDown' })
    expect(document.activeElement).toBe(cells()[40])
    expect(cells().filter((button) => button.tabIndex === 0)).toEqual([cells()[40]])
    expect(document.activeElement).toHaveAccessibleName('Row 5, column 5: hidden')

    fireEvent.click(within(screen.getByRole('group', { name: 'What a tap does' })).getByRole('button', { name: 'Flag' }))
    fireEvent.keyDown(cells()[40], { key: 'Enter' })
    expect(onGameStart).toHaveBeenCalledTimes(1)
    expect(cells()[40]).toHaveAccessibleName('Row 5, column 5: empty')
    // The uncovered cell can still hold the keyboard, and the arrows go on from it.
    expect(cells()[40]).not.toBeDisabled()
    expect(cells()[40]).toHaveAttribute('aria-disabled', 'true')
    fireEvent.keyDown(cells()[40], { key: 'ArrowLeft' })
    expect(document.activeElement).toBe(cells()[39])
  })
})

describe('the larger boards', () => {
  it('draw Intermediate 16 × 16 and Expert 16 rows of 30, fitted while the width is unknown', () => {
    render(<MinesweeperBoardPreview board="intermediate" seed={SEED} />)
    expect(cells()).toHaveLength(256)
    expect(rows()).toHaveLength(16)
    expect(grid()).toHaveAttribute('aria-rowcount', '16')
    expect(grid()).toHaveAttribute('aria-colcount', '16')
    expect(viewport()).toHaveAttribute('data-view', 'fit')

    fireEvent.click(screen.getByRole('button', { name: 'expert' }))
    expect(cells()).toHaveLength(480)
    expect(rows()).toHaveLength(16)
    expect(within(rows()[0]).getAllByRole('gridcell')).toHaveLength(30)
    expect(grid()).toHaveAttribute('data-orientation', 'landscape')
    expect(cells().map(indexOf)).toEqual(Array.from({ length: 480 }, (_, index) => index))
    // Numbers, mines and flags take their size from the cell's.
    expect(grid().style.getPropertyValue('--cell')).toBe('calc((100cqw - 70px) / 30)')
    expect(grid().style.fontSize).toBe('calc(var(--cell) * 0.6)')
  })

  it('switch between Fit and Zoom, keeping the game', () => {
    render(<MinesweeperBoardPreview board="expert" seed={SEED} />)
    fireEvent.click(engineCell(0))
    const uncovered = cells().filter((button) => !isHidden(button)).length
    expect(viewButton('Fit')).toHaveAttribute('aria-pressed', 'true')

    fireEvent.click(viewButton('Zoom'))
    expect(viewport()).toHaveAttribute('data-view', 'zoom')
    expect(viewport()).toHaveClass('overflow-auto', 'max-h-[70svh]')
    expect(grid().style.getPropertyValue('--cell')).toBe('36px')
    expect(grid().style.width).toBe('1150px')
    expect(viewButton('Zoom')).toHaveAttribute('aria-pressed', 'true')
    expect(cells().filter((button) => !isHidden(button))).toHaveLength(uncovered)

    fireEvent.click(viewButton('Fit'))
    expect(viewport()).toHaveAttribute('data-view', 'fit')
    expect(viewport()).not.toHaveClass('overflow-auto')
    expect(grid().style.width).toBe('')
    expect(cells().filter((button) => !isHidden(button))).toHaveLength(uncovered)
  })

  it('open zoomed, and Expert in portrait, on a phone; fitted in landscape on a wide screen', () => {
    frameWidth(343)
    const { unmount } = render(<MinesweeperBoardPreview board="expert" seed={SEED} />)
    expect(grid()).toHaveAttribute('data-orientation', 'portrait')
    expect(viewport()).toHaveAttribute('data-view', 'zoom')
    fireEvent.click(screen.getByRole('button', { name: 'intermediate' }))
    expect(grid()).toHaveAttribute('data-orientation', 'landscape')
    expect(viewport()).toHaveAttribute('data-view', 'zoom')
    unmount()

    frameWidth(1200)
    render(<MinesweeperBoardPreview board="expert" seed={SEED} />)
    expect(grid()).toHaveAttribute('data-orientation', 'landscape')
    expect(viewport()).toHaveAttribute('data-view', 'fit')
  })
})

describe('portrait Expert', () => {
  it('is drawn 30 rows of 16, each drawn cell standing for engine row = its column, column = its row', () => {
    render(<MinesweeperBoardPreview board="expert" seed={SEED} orientation="portrait" />)
    expect(rows()).toHaveLength(30)
    expect(grid()).toHaveAttribute('aria-rowcount', '30')
    expect(grid()).toHaveAttribute('aria-colcount', '16')
    for (let row = 0; row < 30; row++) {
      const drawn = within(rows()[row]).getAllByRole('gridcell')
      expect(drawn).toHaveLength(16)
      drawn.forEach((button, column) => expect(indexOf(button)).toBe(column * 30 + row))
    }
    expect(drawnAt(7, 3)).toHaveAccessibleName('Row 8, column 4: hidden')
    expect(indexOf(drawnAt(7, 3))).toBe(97)
  })

  it('reveals, floods and flags the engine cells the drawn cells stand for', () => {
    render(<MinesweeperBoardPreview board="expert" seed={SEED} orientation="portrait" />)
    // The bottom-left drawn cell is the engine's top-right corner, cell 29.
    fireEvent.click(drawnAt(29, 0))
    let expected = reveal(createMinesweeper(SEED, EXPERT), 29)
    expect(expected.revealed).toBeGreaterThan(1)
    expectBoardToShow(expected)

    const target = expected.cells.findIndex((cell) => !cell.revealed)
    const at = cells().find((button) => indexOf(button) === target) as HTMLElement
    fireEvent.contextMenu(at)
    expected = toggleFlag(expected, target)
    expectBoardToShow(expected)
    expect(status()).toContain('98 mines left')

    const numbered = expected.cells.findIndex((cell) => !cell.revealed && !cell.mine && !cell.flagged && cell.adjacent > 0)
    fireEvent.click(engineCell(numbered))
    expected = reveal(expected, numbered)
    expectBoardToShow(expected)
  })

  it('moves the keyboard over the board as drawn', () => {
    render(<MinesweeperBoardPreview board="expert" seed={SEED} orientation="portrait" />)
    drawnAt(0, 0).focus()
    fireEvent.keyDown(document.activeElement as Element, { key: 'ArrowDown' })
    // One row down as drawn is one column on in the engine.
    expect(indexOf(document.activeElement as HTMLElement)).toBe(1)
    fireEvent.keyDown(document.activeElement as Element, { key: 'ArrowRight' })
    expect(indexOf(document.activeElement as HTMLElement)).toBe(31)
    fireEvent.keyDown(document.activeElement as Element, { key: 'End', ctrlKey: true })
    expect(document.activeElement).toBe(drawnAt(29, 15))
    expect(indexOf(document.activeElement as HTMLElement)).toBe(479)
    fireEvent.keyDown(document.activeElement as Element, { key: 'Home' })
    expect(document.activeElement).toBe(drawnAt(29, 0))
    expect(indexOf(document.activeElement as HTMLElement)).toBe(29)
  })
})

describe('touch and mouse', () => {
  it('reveal with a tap, flag with a right click, and flag with a tap in Flag mode', () => {
    render(<MinesweeperBoardPreview board="intermediate" seed={SEED} />)
    fireEvent.pointerDown(engineCell(136), { pointerType: 'touch', clientX: 100, clientY: 100 })
    fireEvent.pointerUp(engineCell(136), { pointerType: 'touch', clientX: 102, clientY: 101 })
    fireEvent.click(engineCell(136))
    let expected = reveal(createMinesweeper(SEED, INTERMEDIATE), 136)
    expectBoardToShow(expected)

    const first = expected.cells.findIndex((cell) => !cell.revealed)
    fireEvent.contextMenu(engineCell(first))
    expected = toggleFlag(expected, first)
    expectBoardToShow(expected)

    fireEvent.click(within(screen.getByRole('group', { name: 'What a tap does' })).getByRole('button', { name: 'Flag' }))
    const second = expected.cells.findIndex((cell) => !cell.revealed && !cell.flagged)
    fireEvent.click(engineCell(second))
    expected = toggleFlag(expected, second)
    expectBoardToShow(expected)
    expect(status()).toContain('38 mines left')
  })

  it('do nothing when the press pans the board instead', () => {
    render(<MinesweeperBoardPreview board="expert" seed={SEED} />)
    fireEvent.click(viewButton('Zoom'))
    const start = engineCell(250)

    // A finger that slides before it lifts.
    fireEvent.pointerDown(start, { pointerType: 'touch', clientX: 100, clientY: 100 })
    fireEvent.pointerMove(start, { pointerType: 'touch', clientX: 140, clientY: 104 })
    fireEvent.click(start)
    expect(status()).toMatch(/^ready/)

    // The board scrolling under a press.
    fireEvent.pointerDown(start, { pointerType: 'touch', clientX: 100, clientY: 100 })
    fireEvent.scroll(viewport())
    fireEvent.click(start)
    expect(status()).toMatch(/^ready/)

    // A press the browser takes over for its own scrolling, then a long-press menu.
    fireEvent.pointerDown(start, { pointerType: 'touch', clientX: 100, clientY: 100 })
    fireEvent.pointerCancel(start, { pointerType: 'touch' })
    fireEvent.contextMenu(start)
    expect(start).toHaveAccessibleName(/hidden$/)

    // A still tap, after all that, reveals.
    fireEvent.pointerDown(start, { pointerType: 'touch', clientX: 100, clientY: 100 })
    fireEvent.pointerMove(start, { pointerType: 'touch', clientX: 104, clientY: 103 })
    fireEvent.click(start)
    expect(status()).toMatch(/^playing/)
  })

  it('still counts a mouse click that wobbles', () => {
    render(<MinesweeperBoardPreview board="beginner" seed={SEED} />)
    fireEvent.pointerDown(cells()[40], { pointerType: 'mouse', clientX: 100, clientY: 100 })
    fireEvent.pointerMove(cells()[40], { pointerType: 'mouse', clientX: 125, clientY: 100 })
    fireEvent.click(cells()[40])
    expect(status()).toMatch(/^playing/)
  })
})

describe('the keyboard', () => {
  it('reveals with Enter or Space and flags with F, on the cell it is on', () => {
    render(<MinesweeperBoardPreview board="expert" seed={SEED} />)
    expect(cells().filter((button) => button.tabIndex === 0)).toHaveLength(1)
    engineCell(0).focus()
    fireEvent.keyDown(document.activeElement as Element, { key: ' ' })
    let expected = reveal(createMinesweeper(SEED, EXPERT), 0)
    expectBoardToShow(expected)

    const covered = expected.cells.findIndex((cell) => !cell.revealed && !cell.mine && cell.adjacent > 0)
    engineCell(covered).focus()
    fireEvent.keyDown(engineCell(covered), { key: 'F' })
    expected = toggleFlag(expected, covered)
    expectBoardToShow(expected)
    fireEvent.keyDown(engineCell(covered), { key: 'f' })
    fireEvent.keyDown(engineCell(covered), { key: 'Enter' })
    expected = reveal(toggleFlag(expected, covered), covered)
    expectBoardToShow(expected)
  })

  it('keeps one Tab stop that follows the focus, with a visible focus ring', () => {
    render(<MinesweeperBoardPreview board="intermediate" seed={SEED} />)
    expect(cells().filter((button) => button.tabIndex === 0).map(indexOf)).toEqual([0])
    fireEvent.focus(engineCell(200))
    expect(cells().filter((button) => button.tabIndex === 0).map(indexOf)).toEqual([200])
    expect(engineCell(200)).toHaveClass('focus-visible:outline-3', 'focus-visible:outline-brand-500', 'focus-visible:z-10')
    // The edges hold it.
    engineCell(255).focus()
    fireEvent.keyDown(engineCell(255), { key: 'ArrowRight' })
    fireEvent.keyDown(engineCell(255), { key: 'ArrowDown' })
    expect(indexOf(document.activeElement as HTMLElement)).toBe(255)
  })
})

describe('drawing', () => {
  it('draws again only the cells a move changes', () => {
    render(<MinesweeperBoardPreview board="expert" seed={SEED} />)
    const labels = vi.mocked(cellLabel)
    expect(labels.mock.calls.length).toBeGreaterThanOrEqual(480)

    fireEvent.click(engineCell(0))
    const expected = reveal(createMinesweeper(SEED, EXPERT), 0)
    const covered = expected.cells.findIndex((cell) => !cell.revealed && !cell.mine && cell.adjacent > 0)

    labels.mockClear()
    fireEvent.contextMenu(engineCell(covered))
    expect(labels).toHaveBeenCalledTimes(1)

    labels.mockClear()
    fireEvent.contextMenu(engineCell(covered))
    fireEvent.click(engineCell(covered))
    // The flag off, then the one numbered cell uncovered.
    expect(labels).toHaveBeenCalledTimes(2)

    labels.mockClear()
    fireEvent.click(viewButton('Zoom'))
    // A new view resizes the board; no cell needs drawing again.
    expect(labels).not.toHaveBeenCalled()
  })
})
