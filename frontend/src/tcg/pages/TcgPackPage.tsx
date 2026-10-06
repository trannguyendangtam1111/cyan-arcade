import { useParams } from 'react-router'
import { useSession } from '@/api/auth'
import { ApiError } from '@/api/client'
import { Card } from '@/components/ui/Card'
import { ErrorState } from '@/components/ui/ErrorState'
import { LoadingState } from '@/components/ui/LoadingState'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { NotFoundPage } from '@/pages/NotFoundPage'
import { gameAccent } from '../accent'
import { useAllowance, usePack, useTcgGames, type TcgPack } from '../api'
import { Attribution } from '../components/Attribution'
import { Breadcrumbs } from '../components/Breadcrumbs'
import { PackArt } from '../components/PackArt'
import { RarityBadge } from '../components/RarityBadge'
import { SignInPrompt } from '../components/SignInPrompt'
import { PackOpening } from '../opening/PackOpening'

/** One pack, in its game's color: open it, and see exactly what the odds are and where they come from. */
export function TcgPackPage() {
  const packId = Number(useParams().packId)
  const { user, isPending: sessionPending } = useSession()
  const { data: pack, isPending, error, refetch } = usePack(packId)
  const { data: allowance } = useAllowance(Boolean(user))
  const { data: games } = useTcgGames()
  useDocumentTitle(pack?.name)

  if (!Number.isInteger(packId) || packId <= 0) return <NotFoundPage />
  if (isPending) return <LoadingState label="Loading pack…" />
  if (error instanceof ApiError && error.status === 404) return <NotFoundPage />
  if (!pack) return <ErrorState title="Couldn't load this pack" onRetry={() => void refetch()} />

  const game = games?.find((candidate) => candidate.slug === pack.game.slug)

  return (
    <div style={gameAccent(pack.accentColor)} className="flex flex-col gap-8">
      <Breadcrumbs
        crumbs={[
          { label: 'Card packs', to: '/tcg' },
          { label: pack.game.name, to: `/tcg/${pack.game.slug}` },
          { label: pack.set.name, to: `/tcg/${pack.game.slug}/${pack.set.code}` },
          { label: pack.name },
        ]}
      />

      <header className="text-center">
        <h1 className="text-title font-bold">{pack.name}</h1>
        <p className="mx-auto mt-1 max-w-xl text-lg text-ink-soft">{pack.description}</p>
      </header>

      {sessionPending && <LoadingState className="min-h-40" />}
      {user && <PackOpening pack={pack} allowance={allowance} cardBackUrl={game?.cardBackUrl} />}
      {user === null && (
        <div className="flex flex-col items-center gap-6">
          <PackArt pack={pack} label={pack.name} className="w-44" />
          <SignInPrompt title="Log in to open packs">
            The cards you pull are kept in your collection, so opening a pack needs an account.
          </SignInPrompt>
        </div>
      )}

      <Odds pack={pack} />

      <Attribution text={game?.attribution} className="mx-auto w-full max-w-xl" />
    </div>
  )
}

/** The pack's rarity rules, in the open: what each of its cards can turn out to be. */
function Odds({ pack }: { pack: TcgPack }) {
  return (
    <Card padding="none" className="mx-auto w-full max-w-xl overflow-hidden">
      <table className="w-full text-left">
        <caption className="border-b border-line px-5 py-4 text-left">
          <span className="block font-display text-lg font-semibold">What's inside</span>
          <span className="text-sm text-ink-soft">
            {pack.cardsPerPack} cards, from {pack.poolSize} different ones. The server picks them the moment the pack
            is opened.
          </span>
          {pack.oddsNote && (
            <span className="mt-2 block rounded-control bg-amber-50 px-3 py-2 text-sm font-bold text-amber-900">
              {pack.oddsNote}
            </span>
          )}
        </caption>
        <thead className="text-xs font-bold tracking-wide text-ink-soft uppercase">
          <tr>
            <th scope="col" className="w-24 py-3 pl-5">
              Card
            </th>
            <th scope="col" className="py-3 pr-5">
              Chances
            </th>
          </tr>
        </thead>
        <tbody>
          {pack.slots.map(({ slot, odds }) => (
            <tr key={slot} className="border-t border-line">
              <th scope="row" className="py-3 pl-5 font-display font-semibold">
                {slot}
              </th>
              <td className="py-3 pr-5">
                <span className="flex flex-wrap gap-x-4 gap-y-1.5">
                  {odds.map(({ rarity, percent }) => (
                    <span key={rarity.code} className="inline-flex items-center gap-1.5">
                      <RarityBadge rarity={rarity} />
                      <span className="text-sm font-bold tabular-nums">{percent}%</span>
                    </span>
                  ))}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  )
}
