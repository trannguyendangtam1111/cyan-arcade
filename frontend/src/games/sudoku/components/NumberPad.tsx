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
 *
 * One row of nine when the pad has room for each key to be a finger wide (about 44 px): from 27rem,
 * measured on the pad itself as it follows the board's width. Narrower (a phone), two rows, 1 to 5
 * over 6 to 9 centred, so each key stays about 46 px wide at 320 px instead of 25 px. The keys keep
 * their order for the keyboard and screen readers either way.
 */
export function NumberPad({ counts, onDigit, active, notesMode, disabled = false, theme }: NumberPadProps) {
  return (
    <div className="@container w-full">
      <div
        role="group"
        aria-label={notesMode ? 'Number pad, notes' : 'Number pad'}
        className="grid w-full grid-cols-10 gap-1.5 @min-[27rem]:grid-cols-9 @min-[27rem]:max-sm:gap-1"
        style={padStyle(theme) as CSSProperties}
      >
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
                'sudoku-pad-key col-span-2 flex h-12 min-w-0 flex-col items-center justify-center gap-0.5 font-display transition-transform active:translate-y-0.5 @min-[27rem]:col-span-1 @min-[27rem]:max-sm:h-14 sm:h-16',
                // The second row of the narrow pad starts half a key in, under the gap between 1 and 2.
                digit === 6 && 'col-start-2 @min-[27rem]:col-start-auto',
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
    </div>
  )
}
