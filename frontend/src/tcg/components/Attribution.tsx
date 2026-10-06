import { Info } from 'lucide-react'
import { cn } from '@/lib/cn'

/**
 * Where a card game's data and images come from and whose they are, under every page of the game.
 * The arcade does not own the cards it shows, and says so.
 */
export function Attribution({ text, className }: { text: string | null | undefined; className?: string }) {
  if (!text) return null
  return (
    <p className={cn('flex items-start gap-2 border-t border-line pt-4 text-xs leading-relaxed text-ink-soft', className)}>
      <Info aria-hidden className="mt-0.5 size-3.5 shrink-0" />
      <span>{text}</span>
    </p>
  )
}
