import { cn } from '@/lib/cn'

const sizes = {
  md: 'h-11 px-5 text-base gap-2',
  lg: 'h-14 px-7 text-lg gap-2.5',
}

/**
 * The card game's main button: the same chunky arcade button as everywhere else, in the color of
 * whatever is around it (`--accent`): the card game purple on the hub, Pokémon yellow or One Piece
 * red on their pages. `--accent-ink` keeps the label readable on either. Kept here so the shared
 * button does not learn about cards.
 */
export const tcgButton = (size: keyof typeof sizes = 'md', className?: string) =>
  cn(
    'inline-flex select-none items-center justify-center rounded-2xl font-display font-semibold transition-all duration-150',
    'bg-(--accent) text-(--accent-ink) shadow-[0_4px_0_0_color-mix(in_srgb,var(--accent)_55%,black)]',
    'hover:-translate-y-0.5 hover:shadow-[0_6px_0_0_color-mix(in_srgb,var(--accent)_55%,black)]',
    'active:translate-y-1 active:shadow-none disabled:pointer-events-none disabled:opacity-50',
    sizes[size],
    className,
  )
