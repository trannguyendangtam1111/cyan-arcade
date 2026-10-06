import { Heart, ShieldCheck } from 'lucide-react'
import { Link, NavLink, Outlet, ScrollRestoration, useLocation } from 'react-router'
import { isAdmin, useSession } from '@/api/auth'
import { useCoins } from '@/api/economy'
import { ApiStatus } from '@/components/ApiStatus'
import { Logo } from '@/components/brand/Logo'
import { Avatar } from '@/components/ui/Avatar'
import { CoinAmount } from '@/components/ui/CoinAmount'
import { buttonStyles } from '@/components/ui/buttonStyles'
import { cn } from '@/lib/cn'
import { navItems } from './navigation'

/**
 * The signed-in player's coins, a click away from the shop. Read again whenever something changes
 * the balance (a finished game, a claim, a purchase).
 */
function CoinBalance() {
  const { data } = useCoins(true)
  if (!data) return null
  return (
    <Link
      to="/shop"
      title="Your coins: spend them in the shop"
      className="flex h-9 shrink-0 items-center rounded-full bg-amber-50 px-3 text-amber-900 ring-1 ring-amber-300 transition-all hover:bg-amber-100 active:scale-95"
    >
      <CoinAmount amount={data.balance} />
    </Link>
  )
}

/** Top-right corner: the signed-in player (and, for an admin, the way to the admin page), or a way to sign in. */
function AccountLink() {
  const { user, isPending } = useSession()

  // Reserve the space while the session is being looked up, so the header does not jump.
  if (isPending) return <span aria-hidden className="h-9 w-20" />

  if (!user) {
    return (
      <Link to="/login" className={buttonStyles('primary', 'sm')}>
        Log in
      </Link>
    )
  }
  return (
    <span className="flex shrink-0 items-center gap-2">
      <CoinBalance />
      {isAdmin(user) && (
        <Link
          to="/admin"
          aria-label="Admin"
          title="Admin"
          className="grid size-9 shrink-0 place-items-center rounded-full bg-amber-100 text-amber-800 ring-1 ring-amber-300 transition-all hover:bg-amber-200 active:scale-95"
        >
          <ShieldCheck aria-hidden className="size-5" />
        </Link>
      )}
      <Link
        to="/profile"
        aria-label={`Your profile, ${user.displayName}`}
        className="flex max-w-[9rem] shrink-0 items-center gap-2 rounded-full xl:max-w-[11rem] bg-surface py-1 pl-1 max-sm:pr-1 sm:pr-3 font-display font-medium shadow-soft ring-1 ring-line transition-all hover:bg-brand-50 hover:ring-brand-300 active:scale-95"
      >
        <Avatar avatar={user.avatar} size="sm" />
        {/* On a phone the avatar alone stands for the player, leaving room for the coins. */}
        <span className="truncate max-sm:hidden">{user.displayName}</span>
      </Link>
    </span>
  )
}

export function AppLayout() {
  const { pathname } = useLocation()

  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-xl focus:bg-surface focus:px-4 focus:py-2 focus:shadow-soft"
      >
        Skip to content
      </a>

      <header className="sticky top-0 z-40 border-b border-line bg-canvas/85 backdrop-blur-sm">
        <div className="mx-auto flex h-16 max-w-page items-center justify-between gap-4 px-gutter">
          <Logo compactOnTablet />

          <nav aria-label="Primary" className="hidden lg:block">
            <ul className="flex items-center gap-0.5 xl:gap-1">
              {navItems.map(({ to, label, end }) => (
                <li key={to}>
                  <NavLink
                    to={to}
                    end={end}
                    className={({ isActive }) =>
                      cn(
                        'block rounded-full px-3 py-2 font-display font-medium whitespace-nowrap transition-all active:scale-95 xl:px-4',
                        isActive ? 'bg-brand-100 text-brand-800' : 'text-ink-soft hover:bg-surface-muted hover:text-ink',
                      )
                    }
                  >
                    {label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>

          <AccountLink />
        </div>
      </header>

      <main
        id="main"
        tabIndex={-1}
        // Clipped sideways, so decoration that reaches past the edge (a card's glow, a burst) never makes the page scroll.
        className="mx-auto w-full max-w-page flex-1 overflow-x-clip px-gutter py-8 outline-none sm:py-12"
      >
        {/* Keyed by path, so a new page fades in while a changed query string (a filter, a page number) does not. */}
        <div key={pathname} className="motion-safe:animate-page-in">
          <Outlet />
        </div>
      </main>

      {/* Extra bottom padding on small screens keeps the footer clear of the fixed tab bar. */}
      <footer className="border-t border-line pb-20 lg:pb-0">
        <div className="mx-auto flex max-w-page flex-col items-center justify-between gap-3 px-gutter py-6 text-sm text-ink-soft sm:flex-row">
          <p className="flex items-center gap-1.5">
            <Heart aria-hidden className="size-4 text-pink-500" fill="currentColor" />
            Cyan Arcade
          </p>
          <ApiStatus />
        </div>
      </footer>

      <nav
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-sm lg:hidden"
      >
        <ul className="mx-auto grid max-w-xl" style={{ gridTemplateColumns: `repeat(${navItems.length}, minmax(0, 1fr))` }}>
          {navItems.map(({ to, label, shortLabel, icon: Icon, end }) => (
            <li key={to}>
              <NavLink
                to={to}
                end={end}
                className={({ isActive }) =>
                  cn(
                    'group flex h-16 flex-col items-center justify-center gap-0.5 text-[0.7rem] font-bold whitespace-nowrap transition-colors',
                    isActive ? 'text-brand-700' : 'text-ink-soft hover:text-ink',
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    <span
                      className={cn(
                        'grid h-8 w-11 place-items-center rounded-full transition-all group-active:scale-90',
                        isActive && 'bg-brand-100',
                      )}
                    >
                      <Icon aria-hidden className="size-5" strokeWidth={isActive ? 2.5 : 2} />
                    </span>
                    {shortLabel ?? label}
                  </>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      <ScrollRestoration />
    </div>
  )
}
