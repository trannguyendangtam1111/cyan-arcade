import type { GuessView, HintView, LetterResult } from '../types/wordleTypes'

/**
 * What the board and the keyboard show, worked out from what the server said. The rules (judging a
 * guess, hints, the score) are the server's: it keeps the hidden word. This only lays out the answers.
 */

/** The board's size before the server has said: five letters, six guesses. */
export const WORD_LENGTH = 5
export const MAX_GUESSES = 6

export type TileState = 'empty' | 'filled' | 'hint' | 'correct' | 'present' | 'absent'

export interface Tile {
  letter: string
  state: TileState
}

const RANK: Record<LetterResult, number> = { ABSENT: 1, PRESENT: 2, CORRECT: 3 }

const TILE_STATE: Record<LetterResult, TileState> = { CORRECT: 'correct', PRESENT: 'present', ABSENT: 'absent' }

/** Keeps the better news for a letter: correct beats present beats absent. */
function promote(states: Record<string, LetterResult>, letter: string, result: LetterResult) {
  const known = states[letter]
  if (!known || RANK[result] > RANK[known]) states[letter] = result
}

/**
 * The best thing known about each letter, for the keyboard. A letter guessed twice where the word has
 * it once comes back once present (or correct) and once absent; the key shows the better of the two,
 * because the letter is in the word. Hints count too: a revealed letter is correct, a checked one
 * present or absent, removed ones absent.
 */
export function keyboardStates(guesses: GuessView[], hints: HintView[] = []): Record<string, LetterResult> {
  const states: Record<string, LetterResult> = {}
  for (const guess of guesses) {
    ;[...guess.word].forEach((letter, index) => promote(states, letter, guess.feedback[index]))
  }
  for (const hint of hints) {
    if (hint.type === 'REVEAL_LETTER' && hint.letter) promote(states, hint.letter, 'CORRECT')
    if (hint.type === 'CHECK_LETTER' && hint.letter) promote(states, hint.letter, hint.present ? 'PRESENT' : 'ABSENT')
    if (hint.type === 'ELIMINATE_LETTERS') hint.letters?.forEach((letter) => promote(states, letter, 'ABSENT'))
  }
  return states
}

/** Letters a reveal hint showed, by position: shown faintly in the row being typed. */
export function revealedLetters(hints: HintView[]): Map<number, string> {
  const revealed = new Map<number, string>()
  for (const hint of hints) {
    if (hint.type === 'REVEAL_LETTER' && hint.position !== null && hint.letter) revealed.set(hint.position, hint.letter)
  }
  return revealed
}

/**
 * Every row of the board: the guesses with their answers, then the row being typed (unless the game
 * is over), then empty rows.
 */
export function boardRows(
  guesses: GuessView[],
  input: string,
  { over, hints = [], wordLength = WORD_LENGTH, maxGuesses = MAX_GUESSES }: {
    over: boolean
    hints?: HintView[]
    wordLength?: number
    maxGuesses?: number
  },
): Tile[][] {
  const rows: Tile[][] = guesses.map((guess) =>
    [...guess.word].map((letter, index) => ({ letter, state: TILE_STATE[guess.feedback[index]] })),
  )
  if (!over && rows.length < maxGuesses) {
    const ghosts = revealedLetters(hints)
    rows.push(
      Array.from({ length: wordLength }, (_, index) => {
        if (index < input.length) return { letter: input[index], state: 'filled' as const }
        const ghost = ghosts.get(index)
        return ghost ? { letter: ghost, state: 'hint' as const } : { letter: '', state: 'empty' as const }
      }),
    )
  }
  while (rows.length < maxGuesses) {
    rows.push(Array.from({ length: wordLength }, () => ({ letter: '', state: 'empty' as const })))
  }
  return rows
}

export type KeyAction = { kind: 'letter'; letter: string } | { kind: 'enter' } | { kind: 'erase' }

/** What a key means to the game, from `KeyboardEvent.key` or an on-screen key; `null` for anything else. */
export function keyAction(key: string): KeyAction | null {
  if (key === 'Enter') return { kind: 'enter' }
  if (key === 'Backspace' || key === 'Delete') return { kind: 'erase' }
  if (/^[a-zA-Z]$/.test(key)) return { kind: 'letter', letter: key.toUpperCase() }
  return null
}

/** The row being typed after a key: letters fill it up to the word's length, erasing takes the last off. */
export function applyKey(input: string, action: KeyAction, wordLength = WORD_LENGTH): string {
  if (action.kind === 'letter') return input.length < wordLength ? input + action.letter : input
  if (action.kind === 'erase') return input.slice(0, -1)
  return input
}

/** The multiplier the next hint would leave on the score, in percent; `null` when there is none. */
export function percentAfterNextHint(hintPercents: number[], hintsTaken: number): number | null {
  return hintPercents[hintsTaken + 1] ?? null
}

/** A spoiler-free picture of a finished run, row by row, for sharing. */
export function resultGrid(guesses: GuessView[]): string {
  const square: Record<LetterResult, string> = { CORRECT: '🟦', PRESENT: '🟨', ABSENT: '⬜' }
  return guesses.map((guess) => guess.feedback.map((result) => square[result]).join('')).join('\n')
}
