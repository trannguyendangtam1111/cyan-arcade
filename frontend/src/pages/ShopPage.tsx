import { Award, Check, Lock, LogIn, Package, ShoppingBag, Tag } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { useSession } from '@/api/auth'
import { ApiError } from '@/api/client'
import {
  newRequestId,
  useEquip,
  useInventory,
  usePurchase,
  useShop,
  type InventoryEntry,
  type ItemType,
  type PurchaseResponse,
  type ShopItem,
} from '@/api/economy'
import { ItemIcon } from '@/components/ItemIcon'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { buttonStyles } from '@/components/ui/buttonStyles'
import { cardStyles } from '@/components/ui/cardStyles'
import { CoinAmount } from '@/components/ui/CoinAmount'
import { ErrorState } from '@/components/ui/ErrorState'
import { LoadingState } from '@/components/ui/LoadingState'
import { Modal } from '@/components/ui/Modal'
import { PageHeader } from '@/components/ui/PageHeader'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { accentStyle } from '@/lib/accent'
import { cn } from '@/lib/cn'

const sections: { type: ItemType; title: string; description: string }[] = [
  {
    type: 'PACK',
    title: 'Card packs',
    description: "Extra packs for when today's run out. Open them from any booster in Cards.",
  },
  { type: 'BADGE', title: 'Badges', description: 'Wear one on your profile.' },
  { type: 'TITLE', title: 'Titles', description: 'Shown under your name on your profile.' },
  { type: 'COSMETIC', title: 'Cosmetics', description: 'Little extras for your collection.' },
]

/**
 * The shop: virtual items for coins. The page names the item and nothing else; the price, the
 * player's balance and whether they may buy it are all decided by the server.
 */
export function ShopPage() {
  useDocumentTitle('Shop')
  const { user } = useSession()
  const shop = useShop()
  const [buying, setBuying] = useState<{ item: ShopItem; requestId: string } | null>(null)
  const [bought, setBought] = useState<PurchaseResponse | null>(null)

  const balance = shop.data?.balance ?? null

  return (
    <div style={accentStyle('#a855f7')}>
      <PageHeader
        icon={ShoppingBag}
        title="Shop"
        description="Spend the coins you earn playing on card packs, badges and titles."
        actions={
          balance !== null && (
            <p className="flex items-center gap-2 rounded-full bg-amber-50 px-4 py-2 text-lg text-amber-900 ring-2 ring-amber-300">
              <span className="text-sm font-bold">You have</span>
              <CoinAmount amount={balance} />
            </p>
          )
        }
      />

      {!user && (
        <p className={cardStyles('md', 'mb-8 flex flex-wrap items-center justify-between gap-4 text-ink-soft')}>
          <span>
            <strong className="text-ink">Earn coins by playing</strong>, then come back to spend them.
          </span>
          <Link to="/login?redirect=%2Fshop" className={buttonStyles('primary')}>
            <LogIn aria-hidden className="size-4" />
            Log in to shop
          </Link>
        </p>
      )}

      <div aria-live="polite">
        {bought && (
          <p
            role="status"
            className="mb-6 flex flex-wrap items-center gap-2 rounded-card bg-emerald-50 px-5 py-4 font-display font-semibold text-emerald-800 ring-2 ring-emerald-200 motion-safe:animate-pop-in"
          >
            <Check aria-hidden className="size-5" strokeWidth={3} />
            {bought.item.name} is yours!
            {bought.item.type === 'PACK' ? (
              <Link to="/tcg" className="underline">
                Open packs
              </Link>
            ) : (
              <Link to="/profile" className="underline">
                See your profile
              </Link>
            )}
          </p>
        )}
      </div>

      {shop.isPending && <LoadingState label="Opening the shop…" />}
      {shop.isError && <ErrorState title="Couldn't load the shop" onRetry={() => void shop.refetch()} />}
      {shop.data && (
        <div className="flex flex-col gap-section">
          {sections.map((section) => {
            const items = shop.data.items.filter((item) => item.type === section.type)
            if (items.length === 0) return null
            const headingId = `shop-${section.type.toLowerCase()}`
            return (
              <section key={section.type} aria-labelledby={headingId}>
                <h2 id={headingId} className="text-2xl font-bold sm:text-3xl">
                  {section.title}
                </h2>
                <p className="mt-1 mb-5 text-ink-soft">{section.description}</p>
                <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {items.map((item) => (
                    <li key={item.id} className="flex *:w-full">
                      <ItemCard
                        item={item}
                        balance={balance}
                        signedIn={Boolean(user)}
                        onBuy={() => {
                          setBought(null)
                          // One id per purchase the player means to make, so a double click buys once.
                          setBuying({ item, requestId: newRequestId() })
                        }}
                      />
                    </li>
                  ))}
                </ul>
              </section>
            )
          })}
          {user && <Inventory />}
        </div>
      )}

      {buying && balance !== null && (
        <ConfirmPurchase
          item={buying.item}
          requestId={buying.requestId}
          balance={balance}
          onClose={() => setBuying(null)}
          onBought={(purchase) => {
            setBuying(null)
            setBought(purchase)
          }}
        />
      )}
    </div>
  )
}

interface ItemCardProps {
  item: ShopItem
  /** The player's coins, or `null` for a guest. */
  balance: number | null
  signedIn: boolean
  onBuy: () => void
}

function ItemCard({ item, balance, signedIn, onBuy }: ItemCardProps) {
  const locked = item.unlocked === false
  const soldOut = item.soldOut === true
  const affordable = balance !== null && balance >= item.price

  let reason: string | null = null
  if (locked) reason = `Unlocks at level ${item.minLevel}`
  else if (soldOut) reason = 'You own this'
  else if (signedIn && !affordable) reason = 'Not enough coins yet'

  return (
    <article
      aria-label={item.name}
      className={cardStyles('none', cn('flex flex-col gap-4 overflow-hidden p-5', locked && 'opacity-80'))}
    >
      <div className="flex items-start gap-4">
        <span
          className={cn(
            'grid size-16 shrink-0 place-items-center rounded-2xl text-white shadow-soft',
            item.type === 'PACK' ? 'bg-linear-to-br from-purple-500 to-pink-500' : 'bg-linear-to-br from-amber-400 to-orange-500',
          )}
        >
          <ItemIcon icon={item.icon} className="size-8" />
        </span>
        <div className="min-w-0">
          <h3 className="text-lg font-semibold">{item.name}</h3>
          <p className="text-sm text-ink-soft">{item.description}</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {item.type === 'PACK' && (
          <Badge tone="neutral">
            <Tag aria-hidden className="size-3.5" />
            {item.quantity} {item.quantity === 1 ? 'pack' : 'packs'}
          </Badge>
        )}
        {item.minLevel > 1 && (
          <Badge tone={locked ? 'warning' : 'neutral'}>
            {locked ? <Lock aria-hidden className="size-3.5" /> : <Award aria-hidden className="size-3.5" />}
            Level {item.minLevel}
          </Badge>
        )}
        {item.owned !== null && item.owned > 0 && (
          <Badge tone="success">
            <Check aria-hidden className="size-3.5" />
            {item.type === 'PACK' ? `${item.owned} left` : 'Owned'}
          </Badge>
        )}
      </div>

      <div className="mt-auto flex flex-wrap items-center justify-between gap-3">
        <CoinAmount amount={item.price} className="text-xl text-amber-900" />
        {signedIn ? (
          <Button
            size="sm"
            onClick={onBuy}
            disabled={reason !== null}
            aria-label={`Buy ${item.name} for ${item.price} coins`}
            className="bg-purple-500 text-white shadow-[0_4px_0_0_var(--color-purple-800)] hover:bg-purple-400 hover:shadow-[0_6px_0_0_var(--color-purple-800)]"
          >
            Buy
          </Button>
        ) : (
          <Link to="/login?redirect=%2Fshop" className={buttonStyles('secondary', 'sm')}>
            Log in to buy
          </Link>
        )}
      </div>
      {reason && <p className="-mt-2 text-sm font-bold text-ink-soft">{reason}</p>}
    </article>
  )
}

interface ConfirmPurchaseProps {
  item: ShopItem
  requestId: string
  balance: number
  onClose: () => void
  onBought: (purchase: PurchaseResponse) => void
}

/** "Buy this for so many coins?" Nothing is spent until the player says yes. */
function ConfirmPurchase({ item, requestId, balance, onClose, onBought }: ConfirmPurchaseProps) {
  const purchase = usePurchase()
  const error =
    purchase.error instanceof ApiError
      ? purchase.error.message
      : purchase.error
        ? "The purchase didn't go through. Nothing was charged; try again."
        : null

  return (
    <Modal
      open
      onClose={onClose}
      title={`Buy ${item.name}?`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={purchase.isPending}
            onClick={() => purchase.mutate({ itemId: item.id, requestId }, { onSuccess: onBought })}
            className="bg-purple-500 text-white shadow-[0_4px_0_0_var(--color-purple-800)] hover:bg-purple-400"
          >
            {purchase.isPending ? 'Buying…' : 'Buy it'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <p className="flex flex-wrap items-center gap-1.5">
          It costs <CoinAmount amount={item.price} className="text-ink" />. You'll have{' '}
          <CoinAmount amount={balance - item.price} className="text-ink" /> left.
        </p>
        {error && (
          <p role="alert" className="font-bold text-rose-700">
            {error}
          </p>
        )}
      </div>
    </Modal>
  )
}

/** What the player owns: extra packs to open, badges and titles to wear. */
function Inventory() {
  const { data } = useInventory(true)
  const equip = useEquip()
  if (!data) return null

  const wearable = data.items.filter((entry) => entry.equippable)
  return (
    <section aria-labelledby="inventory-heading" className={cardStyles('md', 'flex flex-col gap-4')}>
      <h2 id="inventory-heading" className="text-2xl font-bold">
        Your items
      </h2>
      <p className="flex flex-wrap items-center gap-2 text-ink-soft">
        <Package aria-hidden className="size-5 text-purple-600" />
        <strong className="text-ink">
          {data.bonusPacks} extra {data.bonusPacks === 1 ? 'pack' : 'packs'}
        </strong>
        for when today's run out.
        {data.bonusPacks > 0 && (
          <Link to="/tcg" className="font-bold text-purple-700 hover:text-purple-900">
            Open packs
          </Link>
        )}
      </p>
      {wearable.length === 0 ? (
        <p className="text-ink-soft">No badges or titles yet. Pick one above!</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {wearable.map((entry) => (
            <WearableRow
              key={entry.itemId}
              entry={entry}
              busy={equip.isPending}
              onToggle={() => equip.mutate({ itemId: entry.itemId, equipped: !entry.equipped })}
            />
          ))}
        </ul>
      )}
    </section>
  )
}

function WearableRow({ entry, busy, onToggle }: { entry: InventoryEntry; busy: boolean; onToggle: () => void }) {
  return (
    <li className="flex items-center gap-3 rounded-control bg-surface-muted p-3">
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-amber-400 text-amber-950">
        <ItemIcon icon={entry.icon} className="size-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-display font-semibold">{entry.name}</span>
        <span className="text-sm text-ink-soft">{entry.type === 'TITLE' ? 'Title' : 'Badge'}</span>
      </span>
      <Button
        size="sm"
        variant={entry.equipped ? 'secondary' : 'primary'}
        disabled={busy}
        onClick={onToggle}
        aria-label={entry.equipped ? `Take off ${entry.name}` : `Wear ${entry.name}`}
      >
        {entry.equipped ? 'Wearing' : 'Wear'}
      </Button>
    </li>
  )
}
