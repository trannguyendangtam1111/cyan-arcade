import { cn } from '@/lib/cn'
import { formatScore } from '@/lib/format'

/** The arcade's coin: a little gold disc. Decorative; the amount next to it says what it is. */
export function CoinIcon({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        'inline-grid size-5 shrink-0 place-items-center rounded-full bg-amber-400 font-display text-[0.65rem] leading-none font-bold text-amber-900 shadow-[inset_0_-2px_0_0_var(--color-amber-600)] ring-1 ring-amber-500',
        className,
      )}
    >
      C
    </span>
  )
}

interface CoinAmountProps {
  amount: number
  /** Show a `+` in front of positive amounts (earned) as well as the `−` of negative ones (spent). */
  signed?: boolean
  className?: string
}

/** An amount of coins: the coin, then the number. Read by screen readers as "120 coins". */
export function CoinAmount({ amount, signed = false, className }: CoinAmountProps) {
  const sign = signed && amount > 0 ? '+' : amount < 0 ? '−' : ''
  const text = `${sign}${formatScore(Math.abs(amount))}`
  return (
    <span className={cn('inline-flex items-center gap-1.5 font-display font-semibold tabular-nums', className)}>
      <CoinIcon />
      <span aria-hidden>{text}</span>
      <span className="sr-only">
        {text} {Math.abs(amount) === 1 ? 'coin' : 'coins'}
      </span>
    </span>
  )
}
