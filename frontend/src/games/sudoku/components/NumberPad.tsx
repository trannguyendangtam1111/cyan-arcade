import { Check } from 'lucide-react'
import type { CSSProperties } from 'react'
import { cn } from '@/lib/cn'
import { DIGITS } from '../engine/grid'
import { padStyle, type PadTheme } from '../skins'

interface NumberPadProps {
  /** How many of each digit (index 1–9) are on the board. */
  counts: readonly number[]
  onDigit: (digit: number) => void
  /** The digit fill mode places with every tap on a cell, if any. */
  active: number | null
  notesMode: boolean
  disabled?: boolean
  theme: PadTheme
}

/**
 * Digits 1 to 9, each with how many are still to place. A digit placed nine times is done: it shows a
 * tick and steps back (it can still be used, a wrong one may need moving). Big enough for thumbs.
 */
export function NumberPad({ counts, onDigit, active, notesMode, disabled = false, theme }: NumberPadProps) {
  return (
    <div role="group" aria-label={notesMode ? 'Number pad, notes' : 'Number pad'} className="grid w-full grid-cols-9 gap-1 sm:gap-1.5" style={padStyle(theme) as CSSProperties}>
      {DIGITS.map((digit) => {
        const left = Math.max(0, 9 - counts[digit])
        const done = left === 0
        return (
          <button
            key={digit}
            type="button"
            onClick={() => onDigit(digit)}
            disabled={disabled}
            data-active={active === digit}
            data-done={done}
            aria-pressed={active === null ? undefined : active === digit}
            aria-label={`${digit}${done ? ', all placed' : `, ${left} left`}`}
            className={cn(
              'sudoku-pad-key flex h-14 min-w-0 flex-col items-center justify-center gap-0.5 font-display transition-transform active:translate-y-0.5 sm:h-16',
              done && 'opacity-55',
            )}
          >
            <span className={cn('leading-none font-semibold', notesMode ? 'text-lg sm:text-xl' : 'text-2xl sm:text-3xl')}>{digit}</span>
            <span aria-hidden className="flex h-3.5 items-center text-[0.65rem] leading-none font-bold opacity-75">
              {done ? <Check className="size-3.5" /> : left}
            </span>
          </button>
        )
      })}
    </div>
  )
}
