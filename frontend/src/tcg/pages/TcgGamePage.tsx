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
import { gameAccent } from '../accent'
import { useCollection, useTcgGames, useTcgSets, type SetProgress, type TcgSet } from '../api'
import { Attribution } from '../components/Attribution'
import { Breadcrumbs } from '../components/Breadcrumbs'
import { CardBack } from '../components/CardFace'
import { CompletionBar } from '../components/CompletionBar'
import { SetBanner } from '../components/SetBanner'

/** Sets in the order they came, grouped by the series they belong to ("Scarlet & Violet", ...). */
function bySeries(sets: TcgSet[]): { series: string | null; sets: TcgSet[] }[] {
  const groups: { series: string | null; sets: TcgSet[] }[] = []
  for (const set of sets) {
    const group = groups.find((candidate) => candidate.series === set.series)
    if (group) group.sets.push(set)
    else groups.push({ series: set.series, sets: [set] })
  }
  return groups
}

/** One card game, in its own color: its sets, each with how much of it the player has collected. */
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

  const groups = sets.data ? bySeries(sets.data) : []

  return (
    <div style={gameAccent(game.accentColor)} className="flex flex-col gap-6">
      <Breadcrumbs crumbs={[{ label: 'Card packs', to: '/tcg' }, { label: game.name }]} />

      <header className="flex items-center gap-5">
        <span aria-hidden className="w-16 shrink-0 -rotate-6 shadow-lift sm:w-20">
          {game.imageUrl ? (
            <img src={game.imageUrl} alt="" className="block aspect-5/7 w-full rounded-[5%/3.6%] object-cover ring-2 ring-(--accent)" />
          ) : (
            <CardBack />
          )}
        </span>
        <div>
          <h1 className="text-title font-bold">{game.name}</h1>
          <p className="mt-1 max-w-2xl text-lg text-ink-soft">{game.description}</p>
        </div>
      </header>

      <section aria-labelledby="sets-heading" className="flex flex-col gap-6">
        <h2 id="sets-heading" className="text-xl font-semibold">
          Choose a set
        </h2>

        {sets.isPending && <LoadingState label="Loading sets…" />}
        {sets.isError && <ErrorState title="Couldn't load the sets" onRetry={() => void sets.refetch()} />}
        {sets.data?.length === 0 && (
          <EmptyState icon={Layers} title="No sets yet" description="This game has not released its first set." />
        )}

        {groups.map(({ series, sets: inSeries }) => (
          <div key={series ?? ''} className="flex flex-col gap-4">
            {series && groups.length > 1 && (
              <h3 className="flex items-center gap-2 font-display text-lg font-semibold text-ink-soft">
                <span aria-hidden className="size-2.5 rounded-full bg-(--accent)" />
                {series}
              </h3>
            )}
            <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {inSeries.map((set) => (
                <li key={set.id} className="flex *:w-full">
                  <SetTile
                    set={set}
                    gameSlug={game.slug}
                    progress={collection?.sets.find((candidate) => candidate.id === set.id)}
                  />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>

      <Attribution text={game.attribution} />
    </div>
  )
}

function SetTile({ set, gameSlug, progress }: { set: TcgSet; gameSlug: string; progress: SetProgress | undefined }) {
  const year = set.releasedOn?.slice(0, 4)
  return (
    <Link
      to={`/tcg/${gameSlug}/${set.code}`}
      className={cardStyles('none', cn('group flex flex-col overflow-hidden motion-safe:animate-pop-in', interactiveCard))}
    >
      <SetBanner name={set.name} logoUrl={set.imageUrl} coverImageUrl={set.coverImageUrl} className="aspect-20/9" />
      <span className="flex flex-1 flex-col gap-1.5 p-5">
        <span className="font-display text-xl font-semibold">{set.name}</span>
        <span className="text-sm font-bold text-ink-soft">
          {[year, `${set.cardCount} cards`, `${set.packCount} ${set.packCount === 1 ? 'pack' : 'packs'}`]
            .filter(Boolean)
            .join(' · ')}
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
  )
}
