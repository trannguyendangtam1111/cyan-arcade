import { cn } from '@/lib/cn'

const MEDALS: Record<number, string> = {
  1: 'bg-amber-400 text-amber-950',
  2: 'bg-slate-300 text-slate-800',
  3: 'bg-orange-300 text-orange-950',
}

/** A leaderboard position: gold, silver and bronze discs for the podium, a plain number below it. */
export function RankBadge({ rank, className }: { rank: number; className?: string }) {
  return (
    <span
      className={cn(
        'inline-grid size-8 shrink-0 place-items-center rounded-full font-display font-semibold tabular-nums',
        MEDALS[rank] ?? 'text-ink-soft',
        className,
      )}
    >
      {rank}
    </span>
  )
}
