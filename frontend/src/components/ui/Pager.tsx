import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/cn'
import { Button } from './Button'

interface PagerProps {
  /** What is being paged, for screen readers: "Leaderboard pages". */
  label: string
  /** 1-based. */
  page: number
  totalPages: number
  onPageChange: (page: number) => void
  /** What going back and forward are called. "Previous" and "Next" unless the list has better words. */
  previousLabel?: string
  nextLabel?: string
  className?: string
}

/** Previous and next for a paged list. Renders nothing when everything fits on one page. */
export function Pager({
  label,
  page,
  totalPages,
  onPageChange,
  previousLabel = 'Previous',
  nextLabel = 'Next',
  className,
}: PagerProps) {
  if (totalPages <= 1) return null
  return (
    <nav aria-label={label} className={cn('flex items-center justify-between gap-3', className)}>
      <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
        <ChevronLeft aria-hidden className="size-4" />
        {previousLabel}
      </Button>
      <p className="text-sm font-bold text-ink-soft" aria-live="polite">
        Page {Math.min(page, totalPages)} of {totalPages}
      </p>
      <Button variant="secondary" size="sm" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>
        {nextLabel}
        <ChevronRight aria-hidden className="size-4" />
      </Button>
    </nav>
  )
}
