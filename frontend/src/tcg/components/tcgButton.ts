import { cn } from '@/lib/cn'

const sizes = {
  md: 'h-11 px-5 text-base gap-2',
  lg: 'h-14 px-7 text-lg gap-2.5',
}

/**
 * The card game's main button: the same chunky arcade button as everywhere else, in purple and
 * pink instead of the platform's cyan. Kept here so the shared button does not learn about cards.
 */
export const tcgButton = (size: keyof typeof sizes = 'md', className?: string) =>
  cn(
    'inline-flex select-none items-center justify-center rounded-2xl font-display font-semibold text-white transition-all duration-150',
    // These two shades are the lightest on which white text still meets WCAG AA.
    'bg-linear-to-r from-purple-600 to-pink-600 shadow-[0_4px_0_0_var(--color-purple-900)]',
    'hover:-translate-y-0.5 hover:shadow-[0_6px_0_0_var(--color-purple-900)]',
    'active:translate-y-1 active:shadow-none disabled:pointer-events-none disabled:opacity-50',
    sizes[size],
    className,
  )
