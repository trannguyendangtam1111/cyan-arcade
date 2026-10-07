import { Check, Lock, LogIn, ShoppingBag, Sparkles } from 'lucide-react'
import { useId, useState } from 'react'
import { Link } from 'react-router'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { buttonStyles } from '@/components/ui/buttonStyles'
import { CoinAmount } from '@/components/ui/CoinAmount'
import { Modal } from '@/components/ui/Modal'
import type { GameCosmetics, GameSkin } from '@/games/types'
import { cn } from '@/lib/cn'
import { CATEGORY_LABELS, RARITY_LABELS, SKIN_SLOTS, SKINS, SLOT_LABELS, type Outfit, type SkinSlot } from '../skins'
import type { SkinRarity } from '../skins/skinTypes'
import { SkinPreview } from './SkinPreview'

const RARITY_TONES: Record<SkinRarity, string> = {
  common: 'bg-slate-100 text-slate-700',
  rare: 'bg-sky-100 text-sky-800',
  epic: 'bg-violet-100 text-violet-800',
  legendary: 'bg-amber-100 text-amber-900',
}

interface CustomizeDialogProps {
  open: boolean
  onClose: () => void
  outfit: Outfit
  /** The player's skins from the platform; missing when the platform offers none. */
  cosmetics: GameCosmetics | undefined
}

/**
 * The skin picker: every paddle, ball and brick theme, what the player owns and wears, and where to get
 * the rest. Wearing goes through the platform (which asks the server); buying happens in the shop.
 */
export function CustomizeDialog({ open, onClose, outfit, cosmetics }: CustomizeDialogProps) {
  const [slot, setSlot] = useState<SkinSlot>('paddle')
  const baseId = useId()

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Customize your arcade"
      footer={<Button onClick={onClose}>Done</Button>}
    >
      <div className="flex flex-col gap-4">
        <p className="text-sm">Skins change how things look, never how the game plays: every paddle, ball and brick behaves the same.</p>

        {cosmetics && !cosmetics.signedIn && (
          <p className="flex flex-wrap items-center gap-2 rounded-control bg-surface-muted px-3 py-2 text-sm">
            <span>Collect skins with an account.</span>
            <Link to={cosmetics.loginPath} className="inline-flex items-center gap-1 font-bold text-brand-700 hover:text-brand-900">
              <LogIn aria-hidden className="size-4" />
              Log in
            </Link>
          </p>
        )}

        <div role="tablist" aria-label="What to customize" className="grid grid-cols-3 gap-1 rounded-control bg-surface-muted p-1">
          {SKIN_SLOTS.map((option) => (
            <button
              key={option}
              id={`${baseId}-${option}-tab`}
              type="button"
              role="tab"
              aria-selected={slot === option}
              aria-controls={`${baseId}-${option}-panel`}
              onClick={() => setSlot(option)}
              className={cn(
                'h-10 rounded-xl font-display font-semibold transition-colors',
                slot === option ? 'bg-(--accent) text-(--accent-ink) shadow-soft' : 'text-ink-soft hover:bg-surface hover:text-ink',
              )}
            >
              {SLOT_LABELS[option]}
            </button>
          ))}
        </div>

        <div
          id={`${baseId}-${slot}-panel`}
          role="tabpanel"
          aria-labelledby={`${baseId}-${slot}-tab`}
          className="max-h-[min(26rem,55dvh)] overflow-y-auto pr-1"
        >
          <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            {SKINS[slot].map((skin) => {
              const sold = cosmetics?.skins?.find((candidate) => candidate.slot === slot && candidate.skinId === skin.id)
              // A shop skin the shop does not (or no longer) sell is left out.
              if (skin.unlock.kind === 'shop' && !sold) return null
              return (
                <SkinTile
                  key={skin.id}
                  slot={slot}
                  skinId={skin.id}
                  name={skin.name}
                  description={skin.description}
                  label={`${CATEGORY_LABELS[skin.category]} · ${RARITY_LABELS[skin.rarity]}`}
                  rarity={skin.rarity}
                  free={skin.unlock.kind === 'free'}
                  sold={sold}
                  equipped={outfit[slot].id === skin.id}
                  cosmetics={cosmetics}
                />
              )
            })}
          </ul>
        </div>
      </div>
    </Modal>
  )
}

interface SkinTileProps {
  slot: SkinSlot
  skinId: string
  name: string
  description: string
  label: string
  rarity: SkinRarity
  /** The game's own look, which everyone has. */
  free: boolean
  /** The shop's item for it, for a skin that is sold. */
  sold: GameSkin | undefined
  equipped: boolean
  cosmetics: GameCosmetics | undefined
}

function SkinTile({ slot, skinId, name, description, label, rarity, free, sold, equipped, cosmetics }: SkinTileProps) {
  // Wearable: the game's own look, a skin the player owns, or one the server lets them wear unbought.
  const owned = free || sold?.owned === true || sold?.wearable === true
  const included = !free && sold !== undefined && !sold.owned && sold.wearable === true
  const canWear = owned && !equipped && cosmetics !== undefined && (cosmetics.signedIn || free)
  const lockedByLevel = sold?.unlocked === false

  return (
    <li
      className={cn(
        'flex flex-col gap-2 rounded-control bg-surface-muted p-2.5 ring-2 ring-transparent',
        equipped && 'bg-(--accent)/10 ring-(--accent)',
      )}
    >
      <div className={cn('relative grid h-20 place-items-center rounded-xl bg-surface', !owned && 'opacity-70')}>
        <SkinPreview slot={slot} skinId={skinId} className="h-17" />
        {!owned && (
          <span className="absolute top-1.5 right-1.5 grid size-6 place-items-center rounded-full bg-ink/80 text-white">
            <Lock aria-hidden className="size-3.5" />
          </span>
        )}
      </div>
      <div className="min-w-0">
        <p className="font-display leading-tight font-semibold break-words text-ink" title={description}>
          {name}
        </p>
        <span className={cn('mt-1 inline-block rounded-full px-2 py-0.5 text-[0.7rem] font-bold', RARITY_TONES[rarity])}>{label}</span>
        {included && (
          <span className="mt-1 ml-1 inline-block rounded-full bg-emerald-100 px-2 py-0.5 text-[0.7rem] font-bold text-emerald-900" title="Yours to wear without buying it">
            Included
          </span>
        )}
      </div>

      <div className="mt-auto">
        {equipped ? (
          <Badge tone="brand" className="w-full justify-center py-1.5">
            <Sparkles aria-hidden className="size-3.5" />
            Equipped
          </Badge>
        ) : canWear ? (
          <Button
            size="sm"
            className="w-full"
            disabled={cosmetics?.saving}
            onClick={() => cosmetics?.equip(slot, free ? null : (sold?.itemId ?? null))}
            aria-label={`Equip ${name}`}
          >
            <Check aria-hidden className="size-4" />
            Equip
          </Button>
        ) : sold ? (
          <div className="flex flex-col gap-1.5 text-xs">
            <span className="flex flex-wrap items-center gap-1.5">
              <CoinAmount amount={sold.price} className="text-sm text-amber-900" />
              {sold.minLevel > 1 && (
                <span className={cn('font-bold', lockedByLevel ? 'text-amber-800' : 'text-ink-soft')}>Level {sold.minLevel}</span>
              )}
            </span>
            {cosmetics?.signedIn ? (
              <Link
                to={cosmetics.shopPath}
                aria-label={`Get ${name} in the shop`}
                className={buttonStyles('secondary', 'sm', 'w-full')}
              >
                <ShoppingBag aria-hidden className="size-4" />
                Get it
              </Link>
            ) : (
              <span className="font-bold text-ink-soft">Locked</span>
            )}
          </div>
        ) : null}
      </div>
    </li>
  )
}
