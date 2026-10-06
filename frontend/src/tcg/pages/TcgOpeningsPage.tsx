import { History, PackageOpen } from 'lucide-react'
import { Link, useSearchParams } from 'react-router'
import { useSession } from '@/api/auth'
import { Badge } from '@/components/ui/Badge'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { ErrorState } from '@/components/ui/ErrorState'
import { LoadingState } from '@/components/ui/LoadingState'
import { PageHeader } from '@/components/ui/PageHeader'
import { Pager } from '@/components/ui/Pager'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { cn } from '@/lib/cn'
import { formatDateTime } from '@/lib/format'
import { useOpenings, type Opening } from '../api'
import { CardFace } from '../components/CardFace'
import { PackArt } from '../components/PackArt'
import { SignInPrompt } from '../components/SignInPrompt'
import { tcgButton } from '../components/tcgButton'

/** Every pack the player has opened, newest first, with what came out of it. */
export function TcgOpeningsPage() {
  useDocumentTitle('Opening history')
  const { user, isPending: sessionPending } = useSession()
  const [params, setParams] = useSearchParams()
  const page = Math.max(1, Math.floor(Number(params.get('page'))) || 1)
  const { data, isPending, isError, isPlaceholderData, refetch } = useOpenings(page - 1, Boolean(user))

  return (
    <>
      <PageHeader icon={History} title="Opening history" description="The packs you have opened and what was in them." />

      {sessionPending && <LoadingState label="Loading your history…" />}
      {user === null && (
        <SignInPrompt title="Log in to see your history">
          Every pack you open is recorded on your account, with the cards it gave you.
        </SignInPrompt>
      )}
      {user && isPending && <LoadingState label="Loading your history…" />}
      {user && isError && !data && <ErrorState title="Couldn't load your history" onRetry={() => void refetch()} />}

      {user && data?.totalEntries === 0 && (
        <EmptyState
          icon={PackageOpen}
          title="No packs opened yet"
          description="Your first pack is waiting on the shelf."
          action={
            <Link to="/tcg" className={tcgButton()}>
              Open a pack
            </Link>
          }
        />
      )}

      {user && data && data.totalEntries > 0 && (
        <div className="flex flex-col gap-6">
          <ol
            aria-label="Opened packs"
            className={cn('flex flex-col gap-4 transition-opacity', isPlaceholderData && 'opacity-50')}
          >
            {data.entries.map((opening) => (
              <li key={opening.id}>
                <OpenedPack opening={opening} />
              </li>
            ))}
          </ol>
          <Pager
            label="History pages"
            page={page}
            totalPages={data.totalPages}
            onPageChange={(next) => setParams(next > 1 ? { page: String(next) } : {})}
          />
        </div>
      )}
    </>
  )
}

function OpenedPack({ opening }: { opening: Opening }) {
  const { pack, cards } = opening
  const newCards = cards.filter((card) => card.isNew).length

  return (
    <Card padding="md" className="flex flex-col gap-4 sm:flex-row sm:items-center">
      <div className="flex items-center gap-4 sm:w-64 sm:shrink-0">
        <PackArt pack={pack} className="w-14 shrink-0" />
        <div className="min-w-0">
          <h2 className="truncate font-display text-lg font-semibold">{pack.name}</h2>
          <p className="truncate text-sm text-ink-soft">
            {pack.set.name} · {pack.game.name}
          </p>
          <p className="text-sm text-ink-soft">
            <time dateTime={opening.openedAt}>{formatDateTime(opening.openedAt)}</time>
          </p>
          {newCards > 0 && (
            <Badge tone="success" className="mt-1">
              {newCards} new
            </Badge>
          )}
        </div>
      </div>

      <ul aria-label={`Cards from ${pack.name}`} className="flex flex-1 flex-wrap gap-2">
        {cards.map(({ position, card, isNew }) => (
          <li key={position} className="relative w-16 sm:w-20" title={`${card.name} · ${card.rarity.name}`}>
            <CardFace card={card} size="thumb" />
            <span className="sr-only">
              {card.name}, {card.rarity.name}
              {isNew ? ', new' : ''}
            </span>
            {isNew && (
              <span
                aria-hidden
                className="absolute -top-1 -right-1 rounded-full bg-emerald-700 px-1.5 text-[0.65rem] font-bold text-white"
              >
                NEW
              </span>
            )}
          </li>
        ))}
      </ul>
    </Card>
  )
}
