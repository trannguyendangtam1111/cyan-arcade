import { useHealth } from '@/api/system'
import { cn } from '@/lib/cn'

/** Small footer pill showing whether the backend is reachable. */
export function ApiStatus() {
  const { data, isPending, isError } = useHealth()

  const state = isPending ? 'checking' : !isError && data?.status === 'UP' ? 'online' : 'offline'
  const label = { checking: 'Checking server…', online: 'Server online', offline: 'Server offline' }[state]

  return (
    <span
      className="inline-flex items-center gap-2 rounded-full bg-surface px-3 py-1 text-sm font-semibold text-ink-soft ring-1 ring-brand-100"
      aria-live="polite"
    >
      <span
        aria-hidden
        className={cn(
          'size-2.5 rounded-full',
          state === 'checking' && 'bg-amber-400 motion-safe:animate-pulse',
          state === 'online' && 'bg-emerald-500',
          state === 'offline' && 'bg-rose-500',
        )}
      />
      {label}
    </span>
  )
}
