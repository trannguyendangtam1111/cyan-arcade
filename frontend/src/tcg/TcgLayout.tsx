import { History, Layers, PackageOpen, type LucideIcon } from 'lucide-react'
import { Suspense, type CSSProperties } from 'react'
import { Link, Outlet, useLocation } from 'react-router'
import { useSession } from '@/api/auth'
import { LoadingState } from '@/components/ui/LoadingState'
import { cn } from '@/lib/cn'
import { useAllowance } from './api'

const COLLECTION = '/tcg/collection'
const HISTORY = '/tcg/openings'

/** "Packs" covers everything that leads to opening one: the games, their sets and the packs. */
const sections: { to: string; label: string; icon: LucideIcon; isCurrent: (path: string) => boolean }[] = [
  {
    to: '/tcg',
    label: 'Packs',
    icon: PackageOpen,
    isCurrent: (path) => !path.startsWith(COLLECTION) && !path.startsWith(HISTORY),
  },
  { to: COLLECTION, label: 'Collection', icon: Layers, isCurrent: (path) => path.startsWith(COLLECTION) },
  { to: HISTORY, label: 'History', icon: History, isCurrent: (path) => path.startsWith(HISTORY) },
]

/** Purple with white text on it, where the arcade has cyan with dark text. */
const TCG_ACCENT = { '--accent': 'var(--color-tcg-purple)', '--accent-ink': '#fff' } as CSSProperties

/**
 * The frame around every card game page: its own accent color (purple, where the arcade is cyan),
 * its own little navigation, and how many packs are left today.
 */
export function TcgLayout() {
  const { pathname } = useLocation()
  const { user } = useSession()
  const { data: allowance } = useAllowance(Boolean(user))

  return (
    <div style={TCG_ACCENT} className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Card packs">
          <ul className="flex flex-wrap gap-2">
            {sections.map(({ to, label, icon: Icon, isCurrent }) => {
              const current = isCurrent(pathname)
              return (
                <li key={to}>
                  <Link
                    to={to}
                    aria-current={current ? 'page' : undefined}
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-full px-4 py-2 font-display font-medium ring-2 transition-all active:scale-95',
                      current
                        ? 'bg-linear-to-r from-purple-600 to-pink-600 text-white ring-transparent'
                        : 'bg-surface text-ink-soft ring-line hover:text-ink hover:ring-purple-300',
                    )}
                  >
                    <Icon aria-hidden className="size-4" />
                    {label}
                  </Link>
                </li>
              )
            })}
          </ul>
        </nav>

        {allowance && allowance.leftToday !== null && (
          <p className="rounded-full bg-amber-100 px-4 py-2 text-sm font-bold text-amber-900">
            {allowance.leftToday === 0
              ? 'No packs left today'
              : `${allowance.leftToday} of ${allowance.dailyLimit} packs left today`}
          </p>
        )}
      </div>

      {/* The pages arrive in their own chunk the first time someone comes here. */}
      <Suspense fallback={<LoadingState label="Loading card packs…" />}>
        <Outlet />
      </Suspense>
    </div>
  )
}
