import { Activity, Coins, Gamepad2, Gift, Layers, Package, Search, UserPlus, Users, type LucideIcon } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { MAX_GRANT, useAdminStats, useGrantCoins, useUserSearch, type UserSummary } from '@/api/admin'
import { ApiError } from '@/api/client'
import { newRequestId } from '@/api/economy'
import { Button } from '@/components/ui/Button'
import { cardStyles } from '@/components/ui/cardStyles'
import { CoinAmount } from '@/components/ui/CoinAmount'
import { ErrorState } from '@/components/ui/ErrorState'
import { LoadingState } from '@/components/ui/LoadingState'
import { Modal } from '@/components/ui/Modal'
import { cn } from '@/lib/cn'
import { formatDateTime, formatScore } from '@/lib/format'

interface Tile {
  icon: LucideIcon
  label: string
  value: number
  /** What part of it happened today, when known. */
  today?: number | null
  tone: string
}

/** The arcade at a glance: a handful of counts the server works out when asked. */
export function AdminStats() {
  const { data, isPending, isError, refetch } = useAdminStats(true)

  if (isPending) return <LoadingState label="Counting…" className="min-h-40" />
  if (isError) return <ErrorState title="Couldn't load the numbers" onRetry={() => void refetch()} />

  const activity = (key: string) => data.activities.find((entry) => entry.key === key)
  const packs = activity('tcg.packsOpened')
  const cards = activity('tcg.cardsCollected')
  const tiles: Tile[] = [
    { icon: Users, label: 'Total users', value: data.totalUsers, tone: 'bg-brand-100 text-brand-800' },
    { icon: Activity, label: 'Active users (7 days)', value: data.activeUsers, tone: 'bg-emerald-100 text-emerald-800' },
    { icon: UserPlus, label: 'New users today', value: data.newUsersToday, tone: 'bg-sky-100 text-sky-800' },
    { icon: Gamepad2, label: 'Games played', value: data.gamesPlayed, today: data.gamesToday, tone: 'bg-orange-100 text-orange-800' },
    ...(packs
      ? [{ icon: Package, label: 'Packs opened', value: packs.value, today: packs.today, tone: 'bg-pink-100 text-pink-800' }]
      : []),
    ...(cards
      ? [{ icon: Layers, label: 'Cards collected', value: cards.value, today: cards.today, tone: 'bg-purple-100 text-purple-800' }]
      : []),
    { icon: Coins, label: 'Coins in circulation', value: data.coinsInCirculation, tone: 'bg-amber-100 text-amber-800' },
  ]

  return (
    <section aria-labelledby="admin-stats-heading" className={cardStyles('md', 'flex flex-col gap-4')}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="admin-stats-heading" className="text-xl font-semibold">
          The arcade at a glance
        </h2>
        <p className="text-sm text-ink-soft">As of {formatDateTime(data.generatedAt)} · today is UTC</p>
      </div>
      <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {tiles.map(({ icon: Icon, label, value, today, tone }) => (
          <div key={label} className="rounded-control bg-surface-muted p-3">
            <dt className="flex items-center gap-2 text-sm font-bold text-ink-soft">
              <span className={cn('grid size-7 shrink-0 place-items-center rounded-lg', tone)}>
                <Icon aria-hidden className="size-4" />
              </span>
              {label}
            </dt>
            <dd className="mt-1 font-display text-2xl font-semibold tabular-nums">
              {formatScore(value)}
              {today !== undefined && today !== null && (
                <span className="ml-2 font-sans text-sm font-bold text-emerald-700">+{formatScore(today)} today</span>
              )}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

/**
 * Giving a player coins: find them, say how many and why, confirm. The server checks the amount,
 * records the grant with the admin who made it, and grants each request once.
 */
export function GrantCoins() {
  const [query, setQuery] = useState('')
  const [searched, setSearched] = useState('')
  const [player, setPlayer] = useState<UserSummary | null>(null)
  const [amount, setAmount] = useState('100')
  const [reason, setReason] = useState('')
  const [confirming, setConfirming] = useState<string | null>(null)
  const results = useUserSearch(searched)
  const grant = useGrantCoins()

  const value = Number(amount)
  const validAmount = Number.isInteger(value) && value >= 1 && value <= MAX_GRANT
  const canGrant = player !== null && validAmount && reason.trim().length > 0

  const search = (event: FormEvent) => {
    event.preventDefault()
    setSearched(query)
  }

  return (
    <section aria-labelledby="admin-grant-heading" className={cardStyles('md', 'flex flex-col gap-4')}>
      <h2 id="admin-grant-heading" className="flex items-center gap-2 text-xl font-semibold">
        <Gift aria-hidden className="size-6 text-amber-500" />
        Give coins
      </h2>
      <p className="text-ink-soft">
        For prizes and making things right. Every grant is recorded in the player's coin history, with you and the reason.
      </p>

      <form role="search" onSubmit={search} className="flex gap-2">
        <label htmlFor="admin-user-search" className="sr-only">
          Find a player
        </label>
        <input
          id="admin-user-search"
          type="search"
          value={query}
          maxLength={20}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Find a player by name"
          className="h-11 min-w-0 flex-1 rounded-control bg-surface px-4 ring-2 ring-line focus:ring-brand-400 focus:outline-none"
        />
        <Button type="submit" variant="secondary" disabled={!query.trim()}>
          <Search aria-hidden className="size-4" />
          Find
        </Button>
      </form>

      {results.data && (
        <ul aria-label="Players found" className="flex flex-col gap-2">
          {results.data.length === 0 && <li className="text-ink-soft">No player has a name like that.</li>}
          {results.data.map((account) => (
            <li key={account.id}>
              <button
                type="button"
                aria-pressed={player?.id === account.id}
                onClick={() => setPlayer(account)}
                className={cn(
                  'flex w-full items-center justify-between gap-3 rounded-control px-4 py-2 text-left ring-2 transition-all',
                  player?.id === account.id ? 'bg-amber-50 ring-amber-400' : 'bg-surface-muted ring-transparent hover:ring-line',
                )}
              >
                <span className="font-display font-semibold">
                  {account.username}
                  <span className="ml-2 font-sans text-sm font-bold text-ink-soft">Level {account.level}</span>
                </span>
                <CoinAmount amount={account.coins} className="text-sm" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="grid gap-3 sm:grid-cols-[10rem_1fr]">
        <label className="flex flex-col gap-1 text-sm font-bold">
          Coins
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={MAX_GRANT}
            step={1}
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            aria-invalid={!validAmount}
            className="h-11 rounded-control bg-surface px-4 font-normal ring-2 ring-line focus:ring-brand-400 focus:outline-none aria-invalid:ring-rose-400"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm font-bold">
          Reason
          <input
            type="text"
            value={reason}
            maxLength={150}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Tournament prize"
            className="h-11 rounded-control bg-surface px-4 font-normal ring-2 ring-line focus:ring-brand-400 focus:outline-none"
          />
        </label>
      </div>
      {!validAmount && <p className="text-sm font-bold text-rose-700">Give between 1 and {formatScore(MAX_GRANT)} coins.</p>}

      <Button
        disabled={!canGrant || grant.isPending}
        onClick={() => setConfirming(newRequestId())}
        className="self-start"
      >
        <Gift aria-hidden className="size-4" />
        {player ? `Give coins to ${player.username}` : 'Choose a player first'}
      </Button>

      <div aria-live="polite">
        {grant.data && !grant.isPending && (
          <p role="status" className="font-display font-semibold text-emerald-700">
            {grant.data.repeated ? 'Already given: ' : 'Done: '}
            {grant.data.username} received {formatScore(grant.data.amount)} coins and now has{' '}
            {formatScore(grant.data.balance)}.
          </p>
        )}
        {grant.error && (
          <p role="alert" className="font-bold text-rose-700">
            {grant.error instanceof ApiError ? grant.error.message : "The coins couldn't be given. Try again."}
          </p>
        )}
      </div>

      {player && confirming && (
        <Modal
          open
          onClose={() => setConfirming(null)}
          title={`Give ${formatScore(value)} coins to ${player.username}?`}
          footer={
            <>
              <Button variant="ghost" onClick={() => setConfirming(null)}>
                Cancel
              </Button>
              <Button
                disabled={grant.isPending}
                onClick={() =>
                  grant.mutate(
                    { userId: player.id, amount: value, reason: reason.trim(), requestId: confirming },
                    { onSettled: () => setConfirming(null) },
                  )
                }
              >
                Give coins
              </Button>
            </>
          }
        >
          Reason: “{reason.trim()}”. This is recorded in their coin history and cannot be undone here.
        </Modal>
      )}
    </section>
  )
}
