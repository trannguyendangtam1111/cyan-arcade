import { Award, Check, Lock, Sparkles, Tag } from 'lucide-react'
import { Link } from 'react-router'
import type { AvatarKey } from '@/api/auth'
import type { ShopItem } from '@/api/economy'
import { FramedAvatar } from '@/components/FramedAvatar'
import { GameSkinBadge, GameSkinPreview } from '@/components/GameSkinPreview'
import { ItemIcon } from '@/components/ItemIcon'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { buttonStyles } from '@/components/ui/buttonStyles'
import { cardStyles } from '@/components/ui/cardStyles'
import { CoinAmount } from '@/components/ui/CoinAmount'
import { cn } from '@/lib/cn'
import { formatScore } from '@/lib/format'
import { categoryOf } from './categories'

interface ItemCardProps {
  item: ShopItem
  /** The player's coins, or `null` for a guest. */
  balance: number | null
  signedIn: boolean
  /** The player's avatar, to show a frame on. */
  avatar: AvatarKey
  /** Whether wearing something is being changed right now. */
  busy: boolean
  onBuy: () => void
  onToggleWear: () => void
}

/**
 * One thing for sale and where the player stands with it: locked, too dear, owned, worn, or ready
 * to buy. What is shown comes from the server's answer; the server checks all of it again on a
 * purchase.
 */
export function ItemCard({ item, balance, signedIn, avatar, busy, onBuy, onToggleWear }: ItemCardProps) {
  const category = categoryOf(item.type)
  const owned = item.owned ?? 0
  const locked = item.unlocked === false
  const soldOut = item.soldOut === true
  const affordable = item.affordable ?? (balance !== null && balance >= item.price)
  // Something owned once (a badge, a title, a frame), not packs that get used up.
  const collected = !item.consumable && owned > 0
  const equipped = item.equipped === true

  let reason: string | null = null
  if (locked) reason = `Unlocks at level ${item.minLevel}`
  else if (soldOut && !collected) reason = 'You own as many as you can'
  else if (signedIn && !collected && !affordable && balance !== null) {
    reason = `Not enough coins: ${formatScore(item.price - balance)} more to go`
  }

  return (
    <article
      aria-label={item.name}
      className={cardStyles(
        'none',
        cn(
          'flex flex-col gap-4 overflow-hidden p-5 transition-shadow',
          locked && 'opacity-80',
          equipped && 'ring-4 ring-brand-300',
        ),
      )}
    >
      <div className="flex items-start gap-4">
        <span className={cn('grid size-16 shrink-0 place-items-center rounded-2xl shadow-soft', category.tile)}>
          {item.type === 'COSMETIC' ? (
            <FramedAvatar avatar={avatar} frame={item} size="md" />
          ) : item.type === 'GAME_SKIN' ? (
            <GameSkinPreview item={item} className="h-14" />
          ) : (
            <ItemIcon icon={item.icon} className="size-8" />
          )}
        </span>
        <div className="min-w-0">
          <h3 className="text-lg font-semibold break-words">{item.name}</h3>
          <p className="text-sm text-ink-soft">{item.description}</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {item.type === 'GAME_SKIN' && <GameSkinBadge item={item} />}
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
        {equipped ? (
          <Badge tone="brand">
            <Sparkles aria-hidden className="size-3.5" />
            Equipped
          </Badge>
        ) : (
          collected && (
            <Badge tone="success">
              <Check aria-hidden className="size-3.5" />
              Owned
            </Badge>
          )
        )}
        {item.consumable && owned > 0 && (
          <Badge tone="success">
            <Check aria-hidden className="size-3.5" />
            You have {owned}
          </Badge>
        )}
      </div>

      <div className="mt-auto flex flex-wrap items-center justify-between gap-3">
        {collected ? (
          <span className="font-display text-sm font-semibold text-ink-soft">In your collection</span>
        ) : (
          <CoinAmount amount={item.price} className="text-xl text-amber-900" />
        )}
        {!signedIn ? (
          <Link to="/login?redirect=%2Fshop" className={buttonStyles('secondary', 'sm')}>
            Log in to buy
          </Link>
        ) : collected && item.equippable ? (
          <Button
            size="sm"
            variant={equipped ? 'secondary' : 'primary'}
            disabled={busy}
            onClick={onToggleWear}
            aria-label={equipped ? `Unequip ${item.name}` : `Equip ${item.name}`}
          >
            {equipped ? 'Unequip' : 'Equip'}
          </Button>
        ) : (
          <Button
            size="sm"
            onClick={onBuy}
            disabled={reason !== null}
            aria-label={`Buy ${item.name} for ${item.price} coins`}
            className="bg-purple-500 text-white shadow-[0_4px_0_0_var(--color-purple-800)] hover:bg-purple-400 hover:shadow-[0_6px_0_0_var(--color-purple-800)]"
          >
            {locked && <Lock aria-hidden className="size-4" />}
            Buy
          </Button>
        )}
      </div>
      {reason && <p className="-mt-2 text-sm font-bold text-ink-soft">{reason}</p>}
    </article>
  )
}
