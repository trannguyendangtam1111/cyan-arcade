import { Check, CircleAlert, LogIn, ShoppingBag } from 'lucide-react'
import { useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { useSession } from '@/api/auth'
import { ApiError } from '@/api/client'
import {
  INSUFFICIENT_COINS,
  ITEM_LIMIT_REACHED,
  LEVEL_TOO_LOW,
  newRequestId,
  useEquip,
  usePurchase,
  useShop,
  type ItemType,
  type PurchaseResponse,
  type ShopItem,
} from '@/api/economy'
import { Button } from '@/components/ui/Button'
import { buttonStyles } from '@/components/ui/buttonStyles'
import { cardStyles } from '@/components/ui/cardStyles'
import { CoinAmount } from '@/components/ui/CoinAmount'
import { ErrorState } from '@/components/ui/ErrorState'
import { FilterChip } from '@/components/ui/FilterChip'
import { LoadingState } from '@/components/ui/LoadingState'
import { Modal } from '@/components/ui/Modal'
import { PageHeader } from '@/components/ui/PageHeader'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { accentStyle } from '@/lib/accent'
import { cn } from '@/lib/cn'
import { PackAllowancePanel } from '@/tcg/components/PackAllowancePanel'
import { categoryFromSlug, shopCategories, type ShopCategory } from './shop/categories'
import { Inventory } from './shop/Inventory'
import { ItemCard } from './shop/ItemCard'

/** What the last thing the player did came to: shown above the shelves until the next one. */
interface Feedback {
  tone: 'success' | 'error'
  text: string
  link?: { to: string; label: string }
}

/** Something the player can wear or take off, from the shop's shelves or their inventory. */
interface Wearable {
  itemId: number
  name: string
  equipped: boolean
  type: ItemType
  gameSlug: string | null
}

/** Says what a refused purchase or change means, with the server's own words. */
function problemText(error: unknown, fallback: string): string {
  if (!(error instanceof ApiError)) return fallback
  switch (error.code) {
    case INSUFFICIENT_COINS:
      return `Not enough coins. ${error.message}.`
    case LEVEL_TOO_LOW:
      return `Still locked: ${error.message}.`
    case ITEM_LIMIT_REACHED:
      return `Already yours: ${error.message}.`
    default:
      return error.message
  }
}

/**
 * The shop: virtual items for coins, by category. The page names the item and nothing else; the
 * price, the player's balance, what they own and whether they may buy or wear it are all decided by
 * the server.
 */
export function ShopPage() {
  useDocumentTitle('Shop')
  const { user } = useSession()
  const shop = useShop()
  const equip = useEquip()
  const [params, setParams] = useSearchParams()
  const selected = categoryFromSlug(params.get('category'))
  const [buying, setBuying] = useState<{ item: ShopItem; requestId: string } | null>(null)
  const [feedback, setFeedback] = useState<Feedback | null>(null)

  const balance = shop.data?.balance ?? null
  const avatar = user?.avatar ?? 'ROBOT'
  const select = (category: ShopCategory | null) => setParams(category ? { category: category.slug } : {})

  const toggleWear = (item: Wearable) => {
    setFeedback(null)
    equip.mutate(
      { itemId: item.itemId, equipped: !item.equipped },
      {
        onSuccess: () =>
          setFeedback(
            item.equipped
              ? { tone: 'success', text: `Unequipped ${item.name}.` }
              : item.type === 'GAME_SKIN' && item.gameSlug
                ? {
                    tone: 'success',
                    text: `Equipped! You'll see ${item.name} next time you play.`,
                    link: { to: `/games/${item.gameSlug}`, label: 'Play now' },
                  }
                : {
                    tone: 'success',
                    text: `Equipped! ${item.name} is on your profile.`,
                    link: { to: '/profile', label: 'See your profile' },
                  },
          ),
        onError: (error) => setFeedback({ tone: 'error', text: problemText(error, "Couldn't change that. Try again.") }),
      },
    )
  }

  const bought = (purchase: PurchaseResponse) => {
    setBuying(null)
    const { item } = purchase
    if (item.type === 'GAME_SKIN' && item.gameSlug) {
      setFeedback({
        tone: 'success',
        text: `Purchased! ${item.name} is yours${item.equipped ? ' and already equipped in its game' : ''}.`,
        link: { to: `/games/${item.gameSlug}`, label: 'Play now' },
      })
      return
    }
    setFeedback({
      tone: 'success',
      text: `Purchased! ${item.name} is yours${item.equipped ? ' and already on your profile' : ''}.`,
      link: item.consumable ? { to: '/tcg', label: 'Open packs' } : { to: '/profile', label: 'See your profile' },
    })
  }

  const categories = shopCategories
    .map((category) => ({ category, items: shop.data?.items.filter((item) => item.type === category.type) ?? [] }))
    .filter(({ items }) => items.length > 0)
  const shown = selected ? categories.filter(({ category }) => category.type === selected.type) : categories

  return (
    <div style={accentStyle('#a855f7')}>
      <PageHeader
        icon={ShoppingBag}
        title="Shop"
        description="Spend the coins you earn playing on card packs, badges, titles, profile frames and game skins."
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
        {feedback?.tone === 'success' && (
          <p
            role="status"
            className="mb-6 flex flex-wrap items-center gap-2 rounded-card bg-emerald-50 px-5 py-4 font-display font-semibold text-emerald-800 ring-2 ring-emerald-200 motion-safe:animate-pop-in"
          >
            <Check aria-hidden className="size-5" strokeWidth={3} />
            {feedback.text}
            {feedback.link && (
              <Link to={feedback.link.to} className="underline">
                {feedback.link.label}
              </Link>
            )}
          </p>
        )}
        {feedback?.tone === 'error' && (
          <p
            role="alert"
            className="mb-6 flex flex-wrap items-center gap-2 rounded-card bg-rose-50 px-5 py-4 font-display font-semibold text-rose-800 ring-2 ring-rose-200"
          >
            <CircleAlert aria-hidden className="size-5" />
            {feedback.text}
          </p>
        )}
      </div>

      {shop.isPending && <LoadingState label="Opening the shop…" />}
      {shop.isError && <ErrorState title="Couldn't load the shop" onRetry={() => void shop.refetch()} />}
      {shop.data && (
        <div className="flex flex-col gap-section">
          {user && (selected === null || selected.type === 'PACK') && <PackAllowancePanel />}

          <div>
            {categories.length > 1 && (
              <div role="group" aria-label="Filter by category" className="mb-6 flex flex-wrap gap-2">
                <FilterChip
                  label="All"
                  count={shop.data.items.length}
                  pressed={selected === null}
                  onClick={() => select(null)}
                />
                {categories.map(({ category, items }) => (
                  <FilterChip
                    key={category.type}
                    label={category.label}
                    count={items.length}
                    pressed={selected?.type === category.type}
                    onClick={() => select(category)}
                    icon={<category.icon aria-hidden className="size-4" />}
                  />
                ))}
              </div>
            )}

            <div className="flex flex-col gap-section">
              {shown.length === 0 && (
                <p className={cardStyles('md', 'text-ink-soft')}>
                  Nothing in this category right now.{' '}
                  <button type="button" className="font-bold text-brand-700" onClick={() => select(null)}>
                    Show everything
                  </button>
                </p>
              )}
              {shown.map(({ category, items }) => {
                const headingId = `shop-${category.slug}`
                return (
                  <section key={category.type} aria-labelledby={headingId}>
                    <h2 id={headingId} className="flex items-center gap-2.5 text-2xl font-bold sm:text-3xl">
                      <span className={cn('grid size-9 place-items-center rounded-xl shadow-soft', category.tile)}>
                        <category.icon aria-hidden className="size-5" />
                      </span>
                      {category.title}
                    </h2>
                    <p className="mt-1 mb-5 text-ink-soft">{category.description}</p>
                    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                      {items.map((item) => (
                        <li key={item.id} className="flex *:w-full">
                          <ItemCard
                            item={item}
                            balance={balance}
                            signedIn={Boolean(user)}
                            avatar={avatar}
                            busy={equip.isPending}
                            onBuy={() => {
                              setFeedback(null)
                              // One id per purchase the player means to make, so a double click buys once.
                              setBuying({ item, requestId: newRequestId() })
                            }}
                            onToggleWear={() =>
                              toggleWear({
                                itemId: item.id,
                                name: item.name,
                                equipped: item.equipped === true,
                                type: item.type,
                                gameSlug: item.gameSlug,
                              })
                            }
                          />
                        </li>
                      ))}
                    </ul>
                  </section>
                )
              })}
            </div>
          </div>

          {user && <Inventory avatar={avatar} busy={equip.isPending} onToggleWear={toggleWear} />}
        </div>
      )}

      {buying && balance !== null && (
        <ConfirmPurchase
          item={buying.item}
          requestId={buying.requestId}
          balance={balance}
          onClose={() => setBuying(null)}
          onBought={bought}
        />
      )}
    </div>
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
  const error = purchase.error
    ? problemText(purchase.error, "The purchase didn't go through. Nothing was charged; try again.")
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
        {item.consumable && <p className="text-sm text-ink-soft">Bought packs are opened once today's free packs are used up.</p>}
        {item.type === 'GAME_SKIN' ? (
          <p className="text-sm text-ink-soft">
            A skin only changes how the game looks, never how it plays. Equip it here or from the game's Customize button.
          </p>
        ) : (
          item.equippable && (
            <p className="text-sm text-ink-soft">You can equip and unequip it on your profile whenever you like.</p>
          )
        )}
        {error && (
          <p role="alert" className="font-bold text-rose-700">
            {error}
          </p>
        )}
      </div>
    </Modal>
  )
}
