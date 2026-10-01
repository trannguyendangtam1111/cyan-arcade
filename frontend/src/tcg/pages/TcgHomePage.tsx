import { ArrowRight, Layers } from 'lucide-react'
import { Link } from 'react-router'
import { useSession } from '@/api/auth'
import { cardStyles, interactiveCard } from '@/components/ui/cardStyles'
import { EmptyState } from '@/components/ui/EmptyState'
import { ErrorState } from '@/components/ui/ErrorState'
import { LoadingState } from '@/components/ui/LoadingState'
import { PageHeader } from '@/components/ui/PageHeader'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { cn } from '@/lib/cn'
import { useCollection, useTcgGames } from '../api'
import { CompletionBar } from '../components/CompletionBar'

/** Where card packs start: the card games the arcade carries, and how far the player's collection has come. */
export function TcgHomePage() {
  useDocumentTitle('Card packs')
  const { user } = useSession()
  const { data: games, isPending, isError, refetch } = useTcgGames()
  const { data: collection } = useCollection({ size: 1 }, Boolean(user))

  return (
    <>
      <PageHeader
        icon={Layers}
        title="Card packs"
        description="Open packs, pull rare cards and complete your collection."
      />

      {collection && (
        <section aria-labelledby="my-collection-heading" className={cardStyles('md', 'mb-8')}>
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 id="my-collection-heading" className="text-xl font-semibold">
              Your collection
            </h2>
            <Link
              to="/tcg/collection"
              className="group inline-flex items-center gap-1 rounded font-display font-medium text-purple-700 hover:text-purple-900"
            >
              View all
              <ArrowRight aria-hidden className="size-4 transition-transform group-hover:translate-x-1" />
            </Link>
          </div>
          <CompletionBar
            label="Your collection"
            owned={collection.summary.uniqueCards}
            total={collection.summary.availableCards}
            percent={collection.summary.completionPercent}
          />
        </section>
      )}

      <section aria-labelledby="card-games-heading">
        <h2 id="card-games-heading" className="mb-4 text-xl font-semibold">
          Choose a card game
        </h2>

        {isPending && <LoadingState label="Loading card games…" />}
        {isError && <ErrorState title="Couldn't load the card games" onRetry={() => void refetch()} />}
        {games?.length === 0 && (
          <EmptyState
            icon={Layers}
            title="No card games yet"
            description="The first boosters are still at the printer. Check back soon!"
          />
        )}

        {games && games.length > 0 && (
          <ul className="grid gap-5 md:grid-cols-2">
            {games.map((game) => (
              <li key={game.slug} className="flex *:w-full">
                <Link
                  to={`/tcg/${game.slug}`}
                  className={cardStyles(
                    'none',
                    cn('group flex items-center gap-5 p-5 motion-safe:animate-pop-in', interactiveCard),
                  )}
                >
                  <img
                    src={game.imageUrl}
                    alt=""
                    className="size-24 shrink-0 rounded-3xl object-cover shadow-soft transition-transform group-hover:-rotate-3 group-hover:scale-105 sm:size-28"
                  />
                  <span className="min-w-0">
                    <span className="block font-display text-2xl font-semibold">{game.name}</span>
                    <span className="mt-1 line-clamp-2 block text-ink-soft">{game.description}</span>
                    <span className="mt-2 block text-sm font-bold text-purple-700">
                      {game.setCount} {game.setCount === 1 ? 'set' : 'sets'} · {game.cardCount} cards
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  )
}
