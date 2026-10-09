import { describe, expect, it } from 'vitest'
import type { GuessView, HintView } from '../types/wordleTypes'
import { applyKey, boardRows, keyAction, keyboardStates, percentAfterNextHint, resultGrid, revealedLetters } from './board'

const guess = (word: string, marks: string): GuessView => ({
  word,
  feedback: [...marks].map((mark) => (mark === 'C' ? 'CORRECT' : mark === 'P' ? 'PRESENT' : 'ABSENT')),
})

const hint = (partial: Partial<HintView> & Pick<HintView, 'type'>): HintView => ({
  position: null,
  letter: null,
  present: null,
  letters: null,
  ...partial,
})

describe('the keyboard', () => {
  it('shows what each guessed letter turned out to be', () => {
    const states = keyboardStates([guess('CRANE', 'AAPAC')])

    expect(states).toEqual({ C: 'ABSENT', R: 'ABSENT', A: 'PRESENT', N: 'ABSENT', E: 'CORRECT' })
    expect(states.Z).toBeUndefined()
  })

  it('keeps the better news when a letter comes back twice: ALLEY against APPLE', () => {
    // The first L is present, the second absent: APPLE has one L, so the key says present.
    const states = keyboardStates([guess('ALLEY', 'CPAPA')])

    expect(states.L).toBe('PRESENT')
    expect(states.A).toBe('CORRECT')
    expect(states.Y).toBe('ABSENT')
  })

  it('never downgrades a letter: correct stays correct after a later present', () => {
    const states = keyboardStates([guess('APPLE', 'CAAAA'), guess('LLAMA', 'AAPAA')])

    expect(states.A).toBe('CORRECT')
  })

  it('counts what the hints said', () => {
    const states = keyboardStates(
      [],
      [
        hint({ type: 'REVEAL_LETTER', position: 1, letter: 'P' }),
        hint({ type: 'CHECK_LETTER', letter: 'E', present: true }),
        hint({ type: 'CHECK_LETTER', letter: 'Z', present: false }),
        hint({ type: 'ELIMINATE_LETTERS', letters: ['Q', 'X'] }),
      ],
    )

    expect(states).toEqual({ P: 'CORRECT', E: 'PRESENT', Z: 'ABSENT', Q: 'ABSENT', X: 'ABSENT' })
  })
})

describe('the board', () => {
  it('has six rows of five, with the guesses, then the row being typed, then empty rows', () => {
    const rows = boardRows([guess('CRANE', 'AAPAC')], 'AP', { over: false })

    expect(rows).toHaveLength(6)
    expect(rows.every((row) => row.length === 5)).toBe(true)
    expect(rows[0].map((tile) => tile.state)).toEqual(['absent', 'absent', 'present', 'absent', 'correct'])
    expect(rows[1].map((tile) => `${tile.letter}:${tile.state}`)).toEqual(['A:filled', 'P:filled', ':empty', ':empty', ':empty'])
    expect(rows[5].every((tile) => tile.state === 'empty')).toBe(true)
  })

  it('shows a revealed letter faintly in the row being typed, until a letter is typed there', () => {
    const hints = [hint({ type: 'REVEAL_LETTER', position: 3, letter: 'L' })]

    expect(boardRows([], '', { over: false, hints })[0][3]).toEqual({ letter: 'L', state: 'hint' })
    expect(boardRows([], 'APPX', { over: false, hints })[0][3]).toEqual({ letter: 'X', state: 'filled' })
    expect(revealedLetters(hints)).toEqual(new Map([[3, 'L']]))
  })

  it('types no more row once the game is over', () => {
    const rows = boardRows([guess('APPLE', 'CCCCC')], 'XX', { over: true })

    expect(rows[1].every((tile) => tile.state === 'empty' && tile.letter === '')).toBe(true)
  })

  it('is full after six guesses', () => {
    const six = Array.from({ length: 6 }, () => guess('CRANE', 'AAAAA'))

    expect(boardRows(six, '', { over: true }).flat().every((tile) => tile.state === 'absent')).toBe(true)
  })
})

describe('typing', () => {
  it('maps keys to letters, Enter and erase, and ignores the rest', () => {
    expect(keyAction('a')).toEqual({ kind: 'letter', letter: 'A' })
    expect(keyAction('Q')).toEqual({ kind: 'letter', letter: 'Q' })
    expect(keyAction('Enter')).toEqual({ kind: 'enter' })
    expect(keyAction('Backspace')).toEqual({ kind: 'erase' })
    expect(keyAction('1')).toBeNull()
    expect(keyAction('Shift')).toBeNull()
    expect(keyAction('é')).toBeNull()
  })

  it('fills the row up to five letters and erases the last', () => {
    expect(applyKey('APPL', { kind: 'letter', letter: 'E' })).toBe('APPLE')
    expect(applyKey('APPLE', { kind: 'letter', letter: 'S' })).toBe('APPLE')
    expect(applyKey('APPLE', { kind: 'erase' })).toBe('APPL')
    expect(applyKey('', { kind: 'erase' })).toBe('')
    expect(applyKey('APP', { kind: 'enter' })).toBe('APP')
  })
})

describe('hints and sharing', () => {
  it('says what the next hint leaves of the score', () => {
    expect(percentAfterNextHint([100, 90, 75, 60], 0)).toBe(90)
    expect(percentAfterNextHint([100, 90, 75, 60], 2)).toBe(60)
    expect(percentAfterNextHint([100, 90, 75, 60], 3)).toBeNull()
  })

  it('shares a result without the letters', () => {
    const grid = resultGrid([guess('ALLEY', 'CPAPA'), guess('APPLE', 'CCCCC')])

    expect(grid).toBe('🟦🟨⬜🟨⬜\n🟦🟦🟦🟦🟦')
    expect(grid).not.toMatch(/[A-Z]/)
  })
})
