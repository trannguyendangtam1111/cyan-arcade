import { cn } from '@/lib/cn'

export type CardPadding = 'none' | 'md' | 'lg'

const paddings: Record<CardPadding, string> = {
  none: '',
  md: 'p-5',
  lg: 'p-6 sm:p-8',
}

/** Shared surface styling, so links and other elements can look like a card too. */
export const cardStyles = (padding: CardPadding = 'md', className?: string) =>
  cn('rounded-card bg-surface shadow-soft ring-1 ring-ink/5', paddings[padding], className)

/**
 * Feedback for a card that is a link or a button: it lifts under the pointer, picks up the accent
 * color in scope, and settles back when pressed.
 */
export const interactiveCard =
  'transition-all duration-200 hover:-translate-y-1 hover:shadow-lift hover:ring-2 hover:ring-(--accent)/50 active:translate-y-0 active:shadow-soft'
