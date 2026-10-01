import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { GameProps } from '@/games/types'
import TetrisGame from './TetrisGame'
import type { Cell, PieceType, TetrisState } from './types/tetrisTypes'

const WIDTH = 10
const HEIGHT = 20

/** What every new game in this file starts from, so a test can stage any situation. */
let stage: { rows: string[]; piece: PieceType; lines: number }

vi.mock('./engine/tetrisEngine', async (importOriginal) => {
  const original = await importOriginal<typeof import('./engine/tetrisEngine')>()
  return {
    ...original,
    createTetrisGame: (seed: number): TetrisState => {
      // Bottom rows given as strings such as 'XXXX..XXXX' ('.' is empty).
      const board = new Array<Cell>(WIDTH * HEIGHT).fill(null)
      stage.rows.forEach((row, index) => {
        const y = HEIGHT - stage.rows.length + index
        ;[...row].forEach((char, x) => {
          if (char !== '.') board[y * WIDTH + x] = 'J'
        })
      })
      const { piece } = stage
      return {
        ...original.createTetrisGame(seed),
        board,
        // The same spawn positions the engine uses.
        piece: { type: piece, rotation: 0, x: piece === 'O' ? 4 : 3, y: piece === 'I' ? -1 : 0 },
        queue: ['O', 'O', 'O', 'O', 'O'],
        lines: stage.lines,
        level: Math.floor(stage.lines / 10) + 1,
      }
    },
  }
})

/** Columns 4 and 5 stacked up to just below the spawn rows: the next piece dropped there ends the game. */
const NEARLY_FULL = Array.from({ length: HEIGHT - 2 }, () => '....XX....')

const press = (key: string) => fireEvent.keyDown(window, { key })
const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }))
const stat = (label: string) => Number(screen.getByText(label).nextElementSibling?.textContent)
const boardMarkup = () => screen.getByRole('img', { name: /tetris board/i }).outerHTML
const advance = (ms: number) => act(() => vi.advanceTimersByTime(ms))

function renderGame(handlers: Partial<GameProps> = {}) {
  return render(<TetrisGame onGameStart={vi.fn()} onGameOver={vi.fn()} {...handlers} />)
}

function startGame(handlers: Partial<GameProps> = {}) {
  const view = renderGame(handlers)
  click('Start')
  return view
}

beforeEach(() => {
  window.localStorage.clear()
  stage = { rows: [], piece: 'T', lines: 0 }
})

describe('starting', () => {
  it('waits for the player, and the first key only starts the game', () => {
    const onGameStart = vi.fn()
    renderGame({ onGameStart })
    const spawned = boardMarkup()
    expect(screen.getByRole('heading', { name: 'Ready?' })).toBeInTheDocument()

    press('ArrowLeft')

    expect(screen.queryByRole('heading', { name: 'Ready?' })).not.toBeInTheDocument()
    expect(boardMarkup()).toBe(spawned)
    expect(onGameStart).toHaveBeenCalledTimes(1)
  })

  it('starts with Enter', () => {
    renderGame()

    press('Enter')

    expect(screen.queryByRole('heading', { name: 'Ready?' })).not.toBeInTheDocument()
  })

  it('shows score, lines, level and the next pieces', () => {
    renderGame()

    expect(stat('Score')).toBe(0)
    expect(stat('Lines')).toBe(0)
    expect(stat('Level')).toBe(1)
    expect(screen.getAllByRole('img', { name: 'O piece' })).toHaveLength(3)
  })
})

describe('keyboard controls', () => {
  it('moves with the arrow keys and with A and D', () => {
    startGame()
    const spawned = boardMarkup()

    press('ArrowLeft')
    const left = boardMarkup()
    expect(left).not.toBe(spawned)
    press('d')
    expect(boardMarkup()).toBe(spawned)
    press('ArrowRight')
    expect(boardMarkup()).not.toBe(spawned)
    press('a')
    expect(boardMarkup()).toBe(spawned)
  })

  it('rotates with the up arrow and with W, returning to the start after four turns', () => {
    startGame()
    const spawned = boardMarkup()

    press('ArrowUp')
    expect(boardMarkup()).not.toBe(spawned)
    press('w')
    press('ArrowUp')
    press('w')

    expect(boardMarkup()).toBe(spawned)
  })

  it('soft drops one row per press and scores a point for each', () => {
    startGame()
    const spawned = boardMarkup()

    press('ArrowDown')
    press('s')

    expect(stat('Score')).toBe(2)
    expect(boardMarkup()).not.toBe(spawned)
  })

  it('hard drops with Space, scoring two points per row and bringing in the next piece', () => {
    startGame()

    press(' ')

    expect(stat('Score')).toBe(18 * 2) // a T spawns on rows 0-1 and lands on rows 18-19
  })

  it('pauses with P, freezes the piece and resumes', () => {
    startGame()
    press('p')
    expect(screen.getByRole('heading', { name: 'Paused' })).toBeInTheDocument()
    const frozen = boardMarkup()

    press('ArrowLeft')
    press(' ')
    expect(boardMarkup()).toBe(frozen)

    // Both the pause screen and the sidebar offer Resume; use the one on the pause screen.
    fireEvent.click(screen.getAllByRole('button', { name: 'Resume' })[0])
    expect(screen.queryByRole('heading', { name: 'Paused' })).not.toBeInTheDocument()
    press('ArrowLeft')
    expect(boardMarkup()).not.toBe(frozen)
  })
})

describe('gravity', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('pulls the piece down one row at a time', () => {
    startGame()
    const spawned = boardMarkup()

    advance(799)
    expect(boardMarkup()).toBe(spawned)
    advance(1)
    const oneRowDown = boardMarkup()
    expect(oneRowDown).not.toBe(spawned)
    advance(800)
    expect(boardMarkup()).not.toBe(oneRowDown)
    expect(stat('Score')).toBe(0) // falling on its own scores nothing
  })

  it('gets faster at higher levels', () => {
    stage.lines = 40 // level 5
    startGame()
    const spawned = boardMarkup()

    expect(stat('Level')).toBe(5)
    advance(520)

    expect(boardMarkup()).not.toBe(spawned)
  })

  it('locks a piece that has landed and brings in the next one', () => {
    startGame()

    advance(800 * 19) // 18 rows down, then one more step to lock

    expect(screen.getByRole('img', { name: /tetris board/i }).innerHTML).toContain('bg-purple-500') // the locked T
    expect(stat('Score')).toBe(0)
  })
})

describe('clearing lines', () => {
  it('clears a completed line and announces it', () => {
    stage = { rows: ['XXXX..XXXX'], piece: 'O', lines: 0 }
    startGame()

    press(' ')

    expect(stat('Lines')).toBe(1)
    expect(stat('Score')).toBe(18 * 2 + 100)
    expect(screen.getByText('Single')).toBeInTheDocument()
  })

  it('scores four lines at once as a Tetris', () => {
    stage = { rows: Array.from({ length: 4 }, () => 'XXXX.XXXXX'), piece: 'I', lines: 0 }
    startGame()

    press('ArrowUp') // stand the I upright
    press('ArrowLeft') // line it up with the gap in column 4
    press(' ')

    expect(stat('Lines')).toBe(4)
    expect(stat('Score')).toBe(17 * 2 + 800)
    expect(screen.getByText('Tetris!')).toBeInTheDocument()
  })

  it('moves up a level every ten lines', () => {
    stage = { rows: ['XXXX..XXXX'], piece: 'O', lines: 9 }
    startGame()
    expect(stat('Level')).toBe(1)

    press(' ')

    expect(stat('Lines')).toBe(10)
    expect(stat('Level')).toBe(2)
  })
})

describe('game over', () => {
  beforeEach(() => {
    stage = { rows: NEARLY_FULL, piece: 'O', lines: 0 }
  })

  it('ends when the stack reaches the top and reports the result once', () => {
    const onGameOver = vi.fn()
    startGame({ onGameOver })

    press(' ')
    press(' ')
    press('ArrowLeft')

    expect(screen.getByRole('heading', { name: 'Game over' })).toBeInTheDocument()
    expect(onGameOver).toHaveBeenCalledTimes(1)
    expect(onGameOver.mock.calls[0][0]).toMatchObject({ score: 0, metadata: { lines: 0, level: 1 } })
  })

  it('stops gravity once the game is over', () => {
    vi.useFakeTimers()
    try {
      startGame()
      press(' ')

      expect(vi.getTimerCount()).toBe(0)
    } finally {
      vi.useRealTimers()
    }
  })

  it('celebrates a new best score and remembers it', () => {
    startGame()
    // Put the first piece safely in the left corner, then let the second one end the game.
    for (let i = 0; i < 4; i++) press('ArrowLeft')
    press(' ')
    press(' ')

    expect(screen.getByRole('heading', { name: 'New best!' })).toBeInTheDocument()
    expect(window.localStorage.getItem('cyan-arcade:high-score:tetris')).toBe('36')
  })

  it('restarts into a fresh game that waits for the player', () => {
    const onGameStart = vi.fn()
    startGame({ onGameStart })
    press(' ')
    stage = { rows: [], piece: 'T', lines: 0 }

    click('Play again')

    expect(screen.getByRole('heading', { name: 'Ready?' })).toBeInTheDocument()
    expect(stat('Score')).toBe(0)
    click('Start')
    expect(onGameStart).toHaveBeenCalledTimes(2)
  })
})

describe('touch controls', () => {
  const button = (name: string) => screen.getByRole('button', { name })

  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('offers left, right, rotate, soft drop and hard drop', () => {
    renderGame()

    for (const name of ['Move left', 'Move right', 'Rotate', 'Soft drop', 'Hard drop']) {
      expect(button(name)).toBeInTheDocument()
    }
  })

  it('acts on touch', () => {
    startGame()
    const spawned = boardMarkup()

    fireEvent.pointerDown(button('Move left'))
    fireEvent.pointerUp(button('Move left'))
    expect(boardMarkup()).not.toBe(spawned)

    fireEvent.pointerDown(button('Hard drop'))
    expect(stat('Score')).toBe(18 * 2)
  })

  it('repeats a soft drop while the button is held, and stops on release', () => {
    startGame()

    fireEvent.pointerDown(button('Soft drop'))
    expect(stat('Score')).toBe(1)
    advance(220) // held long enough to start repeating
    expect(stat('Score')).toBe(2)
    advance(70 * 3)
    expect(stat('Score')).toBe(5)

    fireEvent.pointerUp(button('Soft drop'))
    advance(500)
    expect(stat('Score')).toBe(5)
  })

  it('rotates once per press, however long the button is held', () => {
    startGame()
    fireEvent.pointerDown(button('Rotate'))
    const rotatedOnce = boardMarkup()

    advance(600)

    expect(boardMarkup()).toBe(rotatedOnce)
  })

  it('works from the keyboard too', () => {
    startGame()
    const spawned = boardMarkup()

    // A click with detail 0 is what Enter or Space on a focused button produces.
    fireEvent.click(button('Move left'), { detail: 0 })

    expect(boardMarkup()).not.toBe(spawned)
  })

  it('leaves no timer behind when the game is closed while a button is held', () => {
    const { unmount } = startGame()
    fireEvent.pointerDown(button('Soft drop'))

    unmount()

    expect(vi.getTimerCount()).toBe(0)
  })
})
