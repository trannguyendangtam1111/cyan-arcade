import type { HTMLAttributes } from 'react'
import { cn } from '@/lib/cn'

type Tone = 'brand' | 'neutral' | 'accent' | 'success' | 'warning'

const tones: Record<Tone, string> = {
  brand: 'bg-brand-100 text-brand-800',
  neutral: 'bg-surface-muted text-ink-soft',
  // Tinted with whatever `--accent` is in scope (a game's color inside game UI).
  accent: 'bg-(--accent)/15 text-ink ring-1 ring-(--accent)/40',
  success: 'bg-emerald-100 text-emerald-800',
  warning: 'bg-amber-100 text-amber-800',
}

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: Tone
}

export function Badge({ tone = 'brand', className, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold tracking-wide whitespace-nowrap',
        tones[tone],
        className,
      )}
      {...props}
    />
  )
}
