import { cn } from '@/lib/cn'

export type Variant = 'primary' | 'secondary' | 'ghost'
export type Size = 'sm' | 'md' | 'lg'

const variants: Record<Variant, string> = {
  // Chunky "arcade button": it rises a little under the pointer and its solid bottom edge collapses when pressed.
  // Dark text, because white on this cyan is well short of the contrast WCAG AA asks for.
  primary:
    'bg-brand-500 text-brand-950 shadow-[0_4px_0_0_var(--color-brand-700)] hover:-translate-y-0.5 hover:bg-brand-400 hover:shadow-[0_6px_0_0_var(--color-brand-700)] active:translate-y-1 active:shadow-none',
  secondary:
    'bg-surface text-ink ring-2 ring-brand-200 shadow-[0_4px_0_0_var(--color-brand-200)] hover:-translate-y-0.5 hover:ring-brand-300 hover:shadow-[0_6px_0_0_var(--color-brand-200)] active:translate-y-1 active:shadow-none',
  ghost: 'text-ink-soft hover:bg-brand-50 hover:text-ink active:scale-95',
}

const sizes: Record<Size, string> = {
  sm: 'h-9 px-3 text-sm gap-1.5',
  md: 'h-11 px-5 text-base gap-2',
  lg: 'h-14 px-7 text-lg gap-2.5',
}

export const buttonStyles = (variant: Variant = 'primary', size: Size = 'md', className?: string) =>
  cn(
    'inline-flex select-none items-center justify-center rounded-2xl font-display font-semibold transition-all duration-150',
    'disabled:pointer-events-none disabled:opacity-50',
    variants[variant],
    sizes[size],
    className,
  )
