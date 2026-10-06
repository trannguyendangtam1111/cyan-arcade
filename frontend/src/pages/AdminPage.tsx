import { ArrowRight, Bot, Infinity as InfinityIcon, PackageOpen, ShieldCheck } from 'lucide-react'
import type { CSSProperties } from 'react'
import { Link } from 'react-router'
import { useAdminOverview } from '@/api/admin'
import { isAdmin, useSession } from '@/api/auth'
import { Avatar } from '@/components/ui/Avatar'
import { Badge } from '@/components/ui/Badge'
import { buttonStyles } from '@/components/ui/buttonStyles'
import { cardStyles, interactiveCard } from '@/components/ui/cardStyles'
import { EmptyState } from '@/components/ui/EmptyState'
import { ErrorState } from '@/components/ui/ErrorState'
import { LoadingState } from '@/components/ui/LoadingState'
import { PageHeader } from '@/components/ui/PageHeader'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { useGameCatalog } from '@/hooks/useGameCatalog'
import { accentStyle } from '@/lib/accent'
import { cn } from '@/lib/cn'
import { AdminStats, GrantCoins } from './AdminDashboard'

/**
 * The administrator's page: who they are, how the arcade is doing, what being an admin lets them
 * do, and the one thing they can change for a player (coins, with a reason). It shows nothing
 * to anyone else, and its data comes from an endpoint only admins may call; hiding it is a
 * courtesy, the server is what keeps players out.
 */
export function AdminPage() {
  useDocumentTitle('Admin')
  const { user, isPending } = useSession()
  const admin = isAdmin(user)
  const overview = useAdminOverview(admin)

  return (
    <>
      <PageHeader icon={ShieldCheck} title="Admin" description="How the arcade is doing, and what your administrator account can do." />
      {isPending && <LoadingState label="Checking your account…" />}
      {!isPending && !admin && (
        <EmptyState
          icon={ShieldCheck}
          title="Admins only"
          description="This page is for the arcade's administrators. Your account is a player account."
          action={
            <Link to="/" className={buttonStyles('primary')}>
              Back to the arcade
            </Link>
          }
        />
      )}
      {admin && overview.isPending && <LoadingState label="Loading…" />}
      {admin && overview.isError && (
        <ErrorState title="Couldn't load the admin page" onRetry={() => void overview.refetch()} />
      )}
      {admin && overview.data && user && (
        <div className="flex flex-col gap-6">
          <section aria-label="Your account" className={cardStyles('md', 'flex items-center gap-4')}>
            <Avatar avatar={user.avatar} />
            <div className="min-w-0">
              <p className="text-sm text-ink-soft">Signed in as</p>
              <p className="flex flex-wrap items-center gap-2 font-display text-2xl font-semibold">
                <span className="truncate">{overview.data.username}</span>
                <Badge tone="warning" className="text-sm">
                  <ShieldCheck aria-hidden className="size-4" />
                  {overview.data.role}
                </Badge>
              </p>
            </div>
          </section>

          <AdminStats />

          <div className="grid gap-6 lg:grid-cols-2">
            <AiGames />
            <section aria-labelledby="admin-packs-heading" className={cardStyles('md', 'flex flex-col gap-3')}>
              <h2 id="admin-packs-heading" className="flex items-center gap-2 text-xl font-semibold">
                <InfinityIcon aria-hidden className="size-6 text-amber-500" />
                Unlimited card packs
              </h2>
              <p className="text-ink-soft">
                You can open as many packs a day as you like.{' '}
                {overview.data.playerDailyPackLimit !== null
                  ? `Players have ${overview.data.playerDailyPackLimit} a day.`
                  : 'Players have no daily limit either right now.'}
              </p>
              <Link to="/tcg" className={buttonStyles('secondary', 'md', 'self-start')}>
                <PackageOpen aria-hidden className="size-4" />
                Open packs
              </Link>
            </section>
          </div>

          <GrantCoins />
        </div>
      )}
    </>
  )
}

/** The games that have an AI, each a click away from its AI mode. */
function AiGames() {
  const { games } = useGameCatalog()
  const withAi = games?.filter((game) => game.module?.loadAi) ?? []

  return (
    <section aria-labelledby="admin-ai-heading" className={cardStyles('md', 'flex flex-col gap-3')}>
      <h2 id="admin-ai-heading" className="flex items-center gap-2 text-xl font-semibold">
        <Bot aria-hidden className="size-6 text-brand-600" />
        AI mode
      </h2>
      <p className="text-ink-soft">
        These games can play themselves. Open one and switch from Human to AI; players do not have this switch.
      </p>
      <ul className="flex flex-col gap-2">
        {withAi.map((game) => (
          <li key={game.slug} style={accentStyle(game.accentColor) as CSSProperties}>
            <Link
              to={`/games/${game.slug}`}
              className={cardStyles('none', cn('group flex items-center gap-3 p-3', interactiveCard))}
            >
              <img src={game.thumbnail} alt="" className="size-10 rounded-xl" />
              <span className="flex-1 font-display font-semibold">{game.name}</span>
              <ArrowRight aria-hidden className="size-4 text-ink-soft transition-transform group-hover:translate-x-1" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
