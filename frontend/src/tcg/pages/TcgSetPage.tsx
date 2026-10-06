import { PackageOpen } from 'lucide-react'
import { useState } from 'react'
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
import { useOwnedCardsOfSet, useSetCards, useSetPacks, useTcgGames, useTcgSets, type TcgCard } from '../api'
import { Attribution } from '../components/Attribution'
import { Breadcrumbs } from '../components/Breadcrumbs'
import { CardDetail } from '../components/CardDetail'
import { CardTile } from '../components/CardTile'
import { CompletionBar } from '../components/CompletionBar'
import { PackArt } from '../components/PackArt'
import { SetBanner } from '../components/SetBanner'

/** One set, in its game's color: the packs that can be opened, and every card there is to find in them. */
export function TcgSetPage() {
  const { gameSlug = '', setCode = '' } = useParams()
  const { user } = useSession()
  const { data: games } = useTcgGames()
  const sets = useTcgSets(gameSlug)
  const set = sets.data?.find((candidate) => candidate.code === setCode)
  useDocumentTitle(set?.name)

  const packs = useSetPacks(set?.id)
  const cards = useSetCards(set?.id)
  const owned = useOwnedCardsOfSet(gameSlug, set?.id, Boolean(user))
  const [selected, setSelected] = useState<TcgCard | null>(null)

  if (sets.isPending) return <LoadingState label="Loading set…" />
  if (sets.isError) return <ErrorState title="Couldn't load this set" onRetry={() => void sets.refetch()} />
  if (!set) return <NotFoundPage />

  // Known only for a signed-in player; a guest sees every card in full color.
  const quantities = owned.data
    ? new Map(owned.data.cards.map((entry) => [entry.card.id, entry.quantity]))
    : undefined
  const quantityOf = (card: TcgCard) => (quantities ? (quantities.get(card.id) ?? 0) : undefined)
  const progress = owned.data?.sets.find((candidate) => candidate.id === set.id)
  const game = games?.find((candidate) => candidate.slug === set.game.slug)

  return (
    <div style={gameAccent(game?.accentColor)} className="flex flex-col gap-8">
      <Breadcrumbs
        crumbs={[
          { label: 'Card packs', to: '/tcg' },
          { label: set.game.name, to: `/tcg/${set.game.slug}` },
          { label: set.name },
        ]}
      />

      <header className="flex flex-col gap-5 sm:flex-row sm:items-center">
        <SetBanner
          name={set.name}
          logoUrl={set.imageUrl}
          coverImageUrl={set.coverImageUrl}
          className="aspect-20/9 w-full shrink-0 rounded-card shadow-soft sm:w-80"
        />
        <div>
          {set.series && <p className="font-display font-semibold text-ink-soft">{set.series}</p>}
          <h1 className="text-title font-bold">{set.name}</h1>
          <p className="mt-1 max-w-2xl text-lg text-ink-soft">{set.description}</p>
        </div>
      </header>

      <section aria-labelledby="packs-heading">
        <h2 id="packs-heading" className="mb-4 text-xl font-semibold">
          Choose a pack
        </h2>
        {packs.isPending && <LoadingState label="Loading packs…" className="min-h-40" />}
        {packs.isError && <ErrorState title="Couldn't load the packs" onRetry={() => void packs.refetch()} />}
        {packs.data?.length === 0 && (
          <EmptyState icon={PackageOpen} title="No packs on the shelf" description="This set has no packs to open right now." />
        )}
        {packs.data && packs.data.length > 0 && (
          <ul className="grid gap-5 sm:grid-cols-2">
            {packs.data.map((pack) => (
              <li key={pack.id} className="flex *:w-full">
                <Link
                  to={`/tcg/packs/${pack.id}`}
                  className={cardStyles('none', cn('group flex items-center gap-5 p-5', interactiveCard))}
                >
                  <PackArt
                    pack={pack}
                    className="w-24 shrink-0 transition-transform duration-300 group-hover:-rotate-3 group-hover:scale-105 sm:w-28"
                  />
                  <span className="min-w-0">
                    <span className="block font-display text-xl font-semibold">{pack.name}</span>
                    <span className="mt-1 block text-ink-soft">{pack.description}</span>
                    <span className="mt-2 block text-sm font-bold text-ink">
                      {pack.cardsPerPack} cards per pack · {pack.poolSize} to find
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="set-cards-heading">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
          <h2 id="set-cards-heading" className="text-xl font-semibold">
            Cards in this set
          </h2>
          {progress && (
            <CompletionBar
              label={set.name}
              owned={progress.ownedCards}
              total={progress.totalCards}
              percent={progress.completionPercent}
              className="w-full sm:w-72"
            />
          )}
        </div>
        {cards.isPending && <LoadingState label="Loading cards…" className="min-h-40" />}
        {cards.isError && <ErrorState title="Couldn't load the cards" onRetry={() => void cards.refetch()} />}
        {cards.data && (
          <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4 sm:gap-4 md:grid-cols-6">
            {cards.data.map((card) => (
              <li key={card.id}>
                <CardTile card={card} quantity={quantityOf(card)} onSelect={setSelected} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <Attribution text={game?.attribution} />

      <CardDetail
        card={selected}
        quantity={selected ? quantityOf(selected) : undefined}
        onClose={() => setSelected(null)}
      />
    </div>
  )
}
