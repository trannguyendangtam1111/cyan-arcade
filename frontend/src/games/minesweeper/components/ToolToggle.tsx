import { Flag, Pointer } from 'lucide-react'
import { cn } from '@/lib/cn'
import type { Tool } from '../hooks/useMinesweeperGame'

const TOOLS: { tool: Tool; label: string; icon: typeof Flag }[] = [
  { tool: 'reveal', label: 'Reveal', icon: Pointer },
  { tool: 'flag', label: 'Flag', icon: Flag },
]

/**
 * What a tap does: uncover a cell or flag it. Touch screens have no right click, so this is how
 * a phone player flags; with a mouse it works too.
 */
export function ToolToggle({ tool, onChange }: { tool: Tool; onChange: (tool: Tool) => void }) {
  return (
    <div role="group" aria-label="What a tap does" className="grid w-full max-w-xs grid-cols-2 gap-2 rounded-full bg-surface-muted p-1.5">
      {TOOLS.map(({ tool: option, label, icon: Icon }) => (
        <button
          key={option}
          type="button"
          aria-pressed={tool === option}
          onClick={() => onChange(option)}
          className={cn(
            'inline-flex items-center justify-center gap-2 rounded-full px-4 py-2.5 font-display font-semibold transition-all active:scale-95',
            tool === option
              ? 'bg-rose-500 text-white shadow-[0_3px_0_0_var(--color-rose-700)]'
              : 'text-ink-soft hover:text-ink',
          )}
        >
          <Icon aria-hidden className="size-4.5" fill={option === 'flag' && tool === option ? 'currentColor' : 'none'} />
          {label}
        </button>
      ))}
    </div>
  )
}
