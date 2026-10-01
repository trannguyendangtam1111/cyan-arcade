import { Layers, PackageOpen } from 'lucide-react'
import { useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { useSession } from '@/api/auth'
import { cardStyles } from '@/components/ui/cardStyles'
import { EmptyState } from '@/components/ui/EmptyState'
import { ErrorState } from '@/components/ui/ErrorState'
import { LoadingState } from '@/components/ui/LoadingState'
import { PageHeader } from '@/components/ui/PageHeader'
import { Pager } from '@/components/ui/Pager'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { cn } from '@/lib/cn'
import { formatScore } from '@/lib/format'
import { useCollection, type Collection, type TcgCard } from '../api'
import { CardDetail } from '../components/CardDetail'
import { CardTile } from '../components/CardTile'
import { CompletionBar } from '../components/CompletionBar'
import { SignInPrompt } from '../components/SignInPrompt'
import { tcgButton } from '../components/tcgButton'

/** Reads a positive whole number from the URL, or nothing. */
function positive(value: string | null): number | undefined {
  const number = Number(value)
  return Number.isInteger(number) && number > 0 ? number : undefined
}

/**
 * The player's cards: how complete the collection is, set by set, and the cards themselves.
 * The chosen set and page live in the URL (`?set=3&page=2`).
 */
export function TcgCollectionPage() {
  useDocumentTitle('Collection')
  const { user, isPending: sessionPending } = useSession()
  const [params, setParams] = useSearchParams()
  const setId = positive(params.get('set'))
  const page = positive(params.get('page')) ?? 1
  const { data, isPending, isError, isPlaceholderData, refetch } = useCollection({ setId, page: page - 1 }, Boolean(user))
  const [selected, setSelected] = useState<{ card: TcgCard; quantity: number } | null>(null)

  const show = (next: { set?: number; page?: number }) => {
    const query: Record<string, string> = {}
    if (next.set !== undefined) query.set = String(next.set)
    if (next.page !== undefined && next.page > 1) query.page = String(next.page)
    setParams(query)
  }

  return (
    <>
      <PageHeader icon={Layers} title="Collection" description="Every card you have pulled, and what is still out there." />

      {sessionPending && <LoadingState label="Loading your collection…" />}
      {user === null && (
        <SignInPrompt title="Log in to see your collection">
          Cards are kept on your account, so they are there on every device you play on.
        </SignInPrompt>
      )}
      {user && isPending && <LoadingState label="Loading your collection…" />}
      {user && isError && !data && (
        <ErrorState title="Couldn't load your collection" onRetry={() => void refetch()} />
      )}

      {user && data && (
        <div className="flex flex-col gap-8">
          <Summary collection={data} />

          <section aria-labelledby="sets-progress-heading">
            <h2 id="sets-progress-heading" className="mb-4 text-xl font-semibold">
              Sets
            </h2>
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {data.sets.map((set) => {
                const chosen = set.id === setId
                return (
                  <li key={set.id} className="flex *:w-full">
                    <button
                      type="button"
                      aria-pressed={chosen}
                      onClick={() => show(chosen ? {} : { set: set.id })}
                      className={cardStyles(
                        'md',
                        cn(
                          'text-left transition-all hover:-translate-y-0.5 hover:shadow-lift active:translate-y-0',
                          chosen && 'ring-[3px] ring-purple-400',
                        ),
                      )}
                    >
                      <span className="block font-display text-lg font-semibold">{set.name}</span>
                      <span className="mb-3 block text-sm text-ink-soft">{set.game.name}</span>
                      <CompletionBar
                        label={set.name}
                        owned={set.ownedCards}
                        total={set.totalCards}
                        percent={set.completionPercent}
                      />
                    </button>
                  </li>
                )
              })}
            </ul>
          </section>

          <section aria-labelledby="owned-cards-heading">
            <h2 id="owned-cards-heading" className="mb-4 text-xl font-semibold">
              {setId !== undefined
                ? `Your cards from ${data.sets.find((set) => set.id === setId)?.name ?? 'this set'}`
                : 'Your cards'}
            </h2>

            {data.totalEntries === 0 ? (
              <EmptyState
                icon={PackageOpen}
                title={setId !== undefined ? 'Nothing from this set yet' : 'No cards yet'}
                description="Every card you pull from a pack lands here."
                action={
                  <Link to="/tcg" className={tcgButton()}>
                    Open a pack
                  </Link>
                }
              />
            ) : (
              <>
                <ul
                  className={cn(
                    'grid grid-cols-3 gap-3 transition-opacity sm:grid-cols-4 sm:gap-4 md:grid-cols-6',
                    isPlaceholderData && 'opacity-50',
                  )}
                >
                  {data.cards.map(({ card, quantity }) => (
                    <li key={card.id}>
                      <CardTile card={card} quantity={quantity} onSelect={() => setSelected({ card, quantity })} />
                    </li>
                  ))}
                </ul>
                <div className="mt-6">
                  <Pager
                    label="Collection pages"
                    page={page}
                    totalPages={data.totalPages}
                    onPageChange={(next) => show({ set: setId, page: next })}
                  />
                </div>
              </>
            )}
          </section>
        </div>
      )}

      <CardDetail card={selected?.card ?? null} quantity={selected?.quantity} onClose={() => setSelected(null)} />
    </>
  )
}

/** The collection in three numbers and a bar. */
function Summary({ collection }: { collection: Collection }) {
  const { uniqueCards, totalCards, availableCards, completionPercent } = collection.summary
  const figures = [
    { label: 'Different cards', value: `${formatScore(uniqueCards)} / ${formatScore(availableCards)}` },
    { label: 'Cards in total', value: formatScore(totalCards) },
    { label: 'Duplicates', value: formatScore(totalCards - uniqueCards) },
  ]
  return (
    <section aria-labelledby="collection-summary-heading" className={cardStyles('lg')}>
      <h2 id="collection-summary-heading" className="sr-only">
        Statistics
      </h2>
      <dl className="mb-5 grid grid-cols-3 gap-3 text-center">
        {figures.map(({ label, value }) => (
          <div key={label}>
            <dd className="font-display text-2xl font-semibold tabular-nums sm:text-3xl">{value}</dd>
            <dt className="text-sm text-ink-soft">{label}</dt>
          </div>
        ))}
      </dl>
      <CompletionBar label="Your collection" owned={uniqueCards} total={availableCards} percent={completionPercent} />
    </section>
  )
}
