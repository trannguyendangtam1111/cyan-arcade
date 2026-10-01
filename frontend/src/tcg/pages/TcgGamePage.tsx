import { Layers } from 'lucide-react'
import { Link, useParams } from 'react-router'
import { useSession } from '@/api/auth'
import { cardStyles, interactiveCard } from '@/components/ui/cardStyles'
import { EmptyState } from '@/components/ui/EmptyState'
import { ErrorState } from '@/components/ui/ErrorState'
import { LoadingState } from '@/components/ui/LoadingState'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { cn } from '@/lib/cn'
import { NotFoundPage } from '@/pages/NotFoundPage'
import { useCollection, useTcgGames, useTcgSets } from '../api'
import { Breadcrumbs } from '../components/Breadcrumbs'
import { CompletionBar } from '../components/CompletionBar'

/** One card game: its sets, each with how much of it the player has collected. */
export function TcgGamePage() {
  const { gameSlug = '' } = useParams()
  const { user } = useSession()
  const games = useTcgGames()
  const sets = useTcgSets(gameSlug)
  const { data: collection } = useCollection({ gameSlug, size: 1 }, Boolean(user))

  const game = games.data?.find((candidate) => candidate.slug === gameSlug)
  useDocumentTitle(game?.name)

  if (games.isPending) return <LoadingState label="Loading card game…" />
  if (games.isError) return <ErrorState title="Couldn't load this card game" onRetry={() => void games.refetch()} />
  if (!game) return <NotFoundPage />

  return (
    <div className="flex flex-col gap-6">
      <Breadcrumbs crumbs={[{ label: 'Card packs', to: '/tcg' }, { label: game.name }]} />

      <header className="flex items-center gap-5">
        <img src={game.imageUrl} alt="" className="size-20 shrink-0 rounded-3xl object-cover shadow-soft sm:size-24" />
        <div>
          <h1 className="text-title font-bold">{game.name}</h1>
          <p className="mt-1 max-w-2xl text-lg text-ink-soft">{game.description}</p>
        </div>
      </header>

      <section aria-labelledby="sets-heading">
        <h2 id="sets-heading" className="mb-4 text-xl font-semibold">
          Choose a set
        </h2>

        {sets.isPending && <LoadingState label="Loading sets…" />}
        {sets.isError && <ErrorState title="Couldn't load the sets" onRetry={() => void sets.refetch()} />}
        {sets.data?.length === 0 && (
          <EmptyState icon={Layers} title="No sets yet" description="This game has not released its first set." />
        )}

        {sets.data && sets.data.length > 0 && (
          <ul className="grid gap-5 md:grid-cols-2">
            {sets.data.map((set) => {
              const progress = collection?.sets.find((candidate) => candidate.id === set.id)
              return (
                <li key={set.id} className="flex *:w-full">
                  <Link
                    to={`/tcg/${game.slug}/${set.code}`}
                    className={cardStyles(
                      'none',
                      cn('group flex flex-col overflow-hidden motion-safe:animate-pop-in', interactiveCard),
                    )}
                  >
                    <span className="block aspect-20/11 overflow-hidden">
                      <img
                        src={set.imageUrl}
                        alt=""
                        loading="lazy"
                        className="size-full object-cover transition-transform duration-300 group-hover:scale-105"
                      />
                    </span>
                    <span className="flex flex-1 flex-col gap-2 p-5">
                      <span className="font-display text-2xl font-semibold">{set.name}</span>
                      <span className="text-ink-soft">{set.description}</span>
                      <span className="text-sm font-bold text-purple-700">
                        {set.cardCount} cards · {set.packCount} {set.packCount === 1 ? 'pack' : 'packs'}
                      </span>
                      {progress && (
                        <CompletionBar
                          label={set.name}
                          owned={progress.ownedCards}
                          total={progress.totalCards}
                          percent={progress.completionPercent}
                          className="mt-auto pt-2"
                        />
                      )}
                    </span>
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}
