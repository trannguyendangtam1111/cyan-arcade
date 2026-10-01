import { cn } from '@/lib/cn'

interface LoadingStateProps {
  /** Shown under the spinner and announced to screen readers. */
  label?: string
  className?: string
}

/** Block-level loading placeholder for a page or section. */
export function LoadingState({ label = 'Loading…', className }: LoadingStateProps) {
  return (
    <div
      role="status"
      className={cn('flex min-h-60 flex-col items-center justify-center gap-4 text-ink-soft', className)}
    >
      <span
        aria-hidden
        className="size-10 animate-spin rounded-full border-4 border-brand-200 border-t-brand-500"
      />
      <span className="font-display font-medium">{label}</span>
    </div>
  )
}
