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
import { gameAccent } from '../accent'
import { useCollection, useTcgGames, type TcgGame } from '../api'
import { CardBack } from '../components/CardFace'
import { CompletionBar } from '../components/CompletionBar'

/** Where card packs start: the trading card games the arcade carries, and how far the player's collection has come. */
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
        description="Open booster packs of real trading card games, pull rare cards and complete your collection."
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
          Choose your TCG
        </h2>

        {isPending && <LoadingState label="Loading card games…" />}
        {isError && <ErrorState title="Couldn't load the card games" onRetry={() => void refetch()} />}
        {games?.length === 0 && (
          <EmptyState
            icon={Layers}
            title="No card games yet"
            description="The card catalog has not been imported yet. Check back soon!"
          />
        )}

        {games && games.length > 0 && (
          <ul className="grid gap-5 md:grid-cols-2">
            {games.map((game) => (
              <li key={game.slug} className="flex *:w-full">
                <GameTile game={game} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  )
}

/** A card game to choose: one of its own cards on a band of its color, and what it holds. */
function GameTile({ game }: { game: TcgGame }) {
  return (
    <Link
      to={`/tcg/${game.slug}`}
      style={gameAccent(game.accentColor)}
      className={cardStyles('none', cn('group flex overflow-hidden motion-safe:animate-pop-in', interactiveCard))}
    >
      <span aria-hidden className="relative grid w-32 shrink-0 place-items-center bg-(--accent) py-5 sm:w-40">
        <span className="absolute inset-0 bg-linear-to-br from-white/35 to-black/15" />
        <span className="relative w-20 -rotate-6 shadow-lift transition-transform duration-300 group-hover:rotate-0 group-hover:scale-105 sm:w-24">
          {game.imageUrl ? (
            <img src={game.imageUrl} alt="" className="block aspect-5/7 w-full rounded-[5%/3.6%] object-cover ring-2 ring-white" />
          ) : (
            <CardBack />
          )}
        </span>
      </span>
      <span className="flex min-w-0 flex-col justify-center gap-1 p-5">
        <span className="block font-display text-2xl font-semibold">{game.name}</span>
        <span className="line-clamp-3 block text-ink-soft">{game.description}</span>
        <span className="mt-1 block text-sm font-bold text-ink">
          {game.setCount} {game.setCount === 1 ? 'set' : 'sets'} · {game.cardCount.toLocaleString('en-US')} cards
        </span>
      </span>
    </Link>
  )
}
