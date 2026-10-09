import type { CSSProperties } from 'react'

const COLORS = ['#22d3ee', '#f472b6', '#facc15', '#34d399', '#a78bfa', '#fb923c']
const PIECES = 26

/**
 * A short shower of sweets over the board when a puzzle is solved. Every piece's place, colour and
 * fall come from its index, so nothing here is random. Decorative only; hidden from screen readers,
 * and still for players who prefer less motion.
 */
export function Confetti() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 z-20 h-0 overflow-visible">
      {Array.from({ length: PIECES }, (_, index) => {
        const left = (index * 37) % 100
        const round = index % 3 === 0
        const style = {
          left: `${left}%`,
          background: COLORS[index % COLORS.length],
          '--drift': `${((index * 53) % 80) - 40}px`,
          '--spin': `${(index % 2 === 0 ? 1 : -1) * (300 + ((index * 41) % 300))}deg`,
          '--fall': `${1400 + ((index * 97) % 900)}ms`,
          '--wait': `${(index * 47) % 400}ms`,
        } as CSSProperties
        return (
          <span
            key={index}
            style={style}
            className={`wordle-confetti absolute top-0 block opacity-0 ${round ? 'size-2.5 rounded-full' : 'h-3 w-1.5 rounded-sm'}`}
          />
        )
      })}
    </div>
  )
}
