import { CornerDownLeft, Delete } from 'lucide-react'
import type { CSSProperties } from 'react'
import { cn } from '@/lib/cn'
import type { KeyAction } from '../engine/board'
import { paintStyle, type KeyboardTheme, type TileTheme } from '../skins'
import type { LetterResult } from '../types/wordleTypes'

const ROWS = ['QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM']

const STATE_OF: Record<LetterResult, 'correct' | 'present' | 'absent'> = {
  CORRECT: 'correct',
  PRESENT: 'present',
  ABSENT: 'absent',
}

const STATE_WORDS: Record<LetterResult, string> = {
  CORRECT: 'correct',
  PRESENT: 'in the word',
  ABSENT: 'not in the word',
}

interface KeyboardProps {
  /** What is known about each letter. */
  states: Record<string, LetterResult>
  onKey: (action: KeyAction) => void
  tiles: TileTheme
  theme: KeyboardTheme
  disabled?: boolean
  /** A key to press visibly (the AI's typing); a new `id` presses it again. */
  pressed?: { letter: string; id: number }
  /** While picking a letter for a hint: Enter and Delete are not needed. */
  picking?: boolean
}

/**
 * The on-screen keyboard. Keys take the colours of the tiles (a letter known to be in place is teal
 * on both), and the keyboard's own theme dresses the rest.
 */
export function Keyboard({ states, onKey, tiles, theme, disabled = false, pressed, picking = false }: KeyboardProps) {
  const keyStyle = (letter?: string): CSSProperties => {
    const known = letter ? states[letter] : undefined
    const paint = known ? tiles.tiles[STATE_OF[known]] : theme.key
    return { ...paintStyle(paint), borderRadius: theme.radius }
  }

  const keyClass =
    'flex h-[3.25rem] min-w-0 items-center justify-center border font-display text-base font-semibold uppercase transition-[filter,transform] select-none hover:brightness-95 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-60 sm:h-14 sm:text-lg'

  return (
    <div
      role="group"
      aria-label="Keyboard"
      className="flex w-full max-w-[32rem] flex-col gap-1.5 rounded-2xl p-1.5 sm:gap-2"
      style={{ background: theme.tray }}
    >
      {ROWS.map((row, rowIndex) => (
        <div key={row} className="flex justify-center gap-1 sm:gap-1.5">
          {rowIndex === 1 && <span aria-hidden className="flex-[0.5]" />}
          {rowIndex === 2 && (
            <button
              type="button"
              aria-label="Enter"
              disabled={disabled || picking}
              onClick={() => onKey({ kind: 'enter' })}
              style={keyStyle()}
              className={cn(keyClass, 'flex-[1.5] text-xs sm:text-sm')}
            >
              <CornerDownLeft aria-hidden className="size-5" />
            </button>
          )}
          {[...row].map((letter) => {
            const known = states[letter]
            return (
              <button
                // A new element replays the press when the AI types the same letter twice.
                key={pressed?.letter === letter ? `${letter}-${pressed.id}` : letter}
                type="button"
                aria-label={known ? `${letter}, ${STATE_WORDS[known]}` : letter}
                data-state={known ? STATE_OF[known] : 'unknown'}
                disabled={disabled}
                onClick={() => onKey({ kind: 'letter', letter })}
                style={keyStyle(letter)}
                className={cn(keyClass, 'flex-1', pressed?.letter === letter && 'wordle-key-press brightness-90')}
              >
                {letter}
              </button>
            )
          })}
          {rowIndex === 2 && (
            <button
              type="button"
              aria-label="Delete letter"
              disabled={disabled || picking}
              onClick={() => onKey({ kind: 'erase' })}
              style={keyStyle()}
              className={cn(keyClass, 'flex-[1.5]')}
            >
              <Delete aria-hidden className="size-5" />
            </button>
          )}
          {rowIndex === 1 && <span aria-hidden className="flex-[0.5]" />}
        </div>
      ))}
    </div>
  )
}
