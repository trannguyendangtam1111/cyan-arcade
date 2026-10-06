import { Backpack, Package, Sparkles } from 'lucide-react'
import { Link } from 'react-router'
import type { AvatarKey } from '@/api/auth'
import { useInventory, type InventoryEntry } from '@/api/economy'
import { FramedAvatar } from '@/components/FramedAvatar'
import { ItemIcon } from '@/components/ItemIcon'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { cardStyles } from '@/components/ui/cardStyles'
import { cn } from '@/lib/cn'
import { shopCategories } from './categories'

interface InventoryProps {
  avatar: AvatarKey
  /** Whether wearing something is being changed right now. */
  busy: boolean
  onToggleWear: (entry: InventoryEntry) => void
}

/**
 * What the player owns: packs to open, and the badges, titles and frames to wear, each kind on its
 * own. Wearing is checked by the server, which only lets a player wear what they own.
 */
export function Inventory({ avatar, busy, onToggleWear }: InventoryProps) {
  const { data, isError, refetch } = useInventory(true)

  return (
    <section aria-labelledby="inventory-heading" className={cardStyles('md', 'flex flex-col gap-5')}>
      <h2 id="inventory-heading" className="flex items-center gap-2.5 text-2xl font-bold">
        <span className="grid size-10 place-items-center rounded-2xl bg-brand-500 text-brand-950 shadow-soft">
          <Backpack aria-hidden className="size-5.5" />
        </span>
        Your items
      </h2>

      {isError && !data && (
        <p className="text-ink-soft">
          Your items couldn't be loaded.{' '}
          <button type="button" className="font-bold text-brand-700" onClick={() => void refetch()}>
            Try again
          </button>
        </p>
      )}

      {data && (
        <>
          <div className="flex flex-wrap items-center gap-2 rounded-control bg-purple-50 px-4 py-3 text-ink-soft ring-2 ring-purple-200">
            <Package aria-hidden className="size-5 text-purple-600" />
            <strong className="text-ink">
              {data.bonusPacks} bought {data.bonusPacks === 1 ? 'pack' : 'packs'}
            </strong>
            <Badge tone="neutral">Consumable</Badge>
            <span>for when today's free packs run out.</span>
            {data.bonusPacks > 0 && (
              <Link to="/tcg" className="font-bold text-purple-700 hover:text-purple-900">
                Open packs
              </Link>
            )}
          </div>

          {data.items.every((entry) => !entry.equippable) ? (
            <p className="text-ink-soft">Nothing to wear yet. Badges, titles and frames you buy show up here.</p>
          ) : (
            shopCategories
              .filter((category) => data.items.some((entry) => entry.equippable && entry.type === category.type))
              .map((category) => (
                <div key={category.type}>
                  <h3 className="mb-2 flex items-center gap-1.5 text-lg font-semibold">
                    <category.icon aria-hidden className="size-4.5 text-ink-soft" />
                    {category.title}
                  </h3>
                  <ul className="grid gap-3 sm:grid-cols-2">
                    {data.items
                      .filter((entry) => entry.equippable && entry.type === category.type)
                      .map((entry) => (
                        <WearableRow
                          key={entry.itemId}
                          entry={entry}
                          avatar={avatar}
                          tile={category.tile}
                          busy={busy}
                          onToggle={() => onToggleWear(entry)}
                        />
                      ))}
                  </ul>
                </div>
              ))
          )}
        </>
      )}
    </section>
  )
}

interface WearableRowProps {
  entry: InventoryEntry
  avatar: AvatarKey
  tile: string
  busy: boolean
  onToggle: () => void
}

function WearableRow({ entry, avatar, tile, busy, onToggle }: WearableRowProps) {
  return (
    <li
      className={cn(
        'flex items-center gap-3 rounded-control bg-surface-muted p-3',
        entry.equipped && 'bg-brand-50 ring-2 ring-brand-300',
      )}
    >
      <span className={cn('grid size-11 shrink-0 place-items-center rounded-xl', tile)}>
        {entry.type === 'COSMETIC' ? (
          <FramedAvatar avatar={avatar} frame={entry} size="sm" />
        ) : (
          <ItemIcon icon={entry.icon} className="size-5" />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-display font-semibold break-words">{entry.name}</span>
        {entry.equipped ? (
          <span className="inline-flex items-center gap-1 text-sm font-bold text-brand-800">
            <Sparkles aria-hidden className="size-3.5" />
            Equipped
          </span>
        ) : (
          <span className="text-sm text-ink-soft">Owned</span>
        )}
      </span>
      <Button
        size="sm"
        variant={entry.equipped ? 'secondary' : 'primary'}
        disabled={busy}
        onClick={onToggle}
        aria-label={entry.equipped ? `Unequip ${entry.name}` : `Equip ${entry.name}`}
      >
        {entry.equipped ? 'Unequip' : 'Equip'}
      </Button>
    </li>
  )
}
