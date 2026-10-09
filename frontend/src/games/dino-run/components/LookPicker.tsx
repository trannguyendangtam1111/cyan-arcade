import { Lock, LogIn, ShoppingBag } from 'lucide-react'
import { Link } from 'react-router'
import { CoinAmount } from '@/components/ui/CoinAmount'
import type { GameCosmetics, GameSkin } from '@/games/types'
import { cn } from '@/lib/cn'
import { DEFAULT_OUTFIT, SKIN_SLOTS, SLOT_LABELS, type Outfit, type SkinSlot } from '../skins'
import { SkinPreview } from './SkinPreview'

interface LookPickerProps {
  cosmetics: GameCosmetics | undefined
  outfit: Outfit
}

/**
 * How Pip and the obstacles look: the game's own, or a skin the player may wear (owned, or free for an
 * admin, as the server says). The world is not picked here: every run goes through all of them. Skins not yet owned point to the shop; wearing goes through
 * the platform, which asks the server.
 */
export function LookPicker({ cosmetics, outfit }: LookPickerProps) {
  if (!cosmetics) return null

  return (
    <section aria-labelledby="dino-look" className="flex flex-col gap-3 rounded-control bg-surface-muted p-3">
      <h2 id="dino-look" className="font-display text-base font-semibold">
        Your look
      </h2>
      {!cosmetics.signedIn && (
        <Link to={cosmetics.loginPath} className="inline-flex items-center gap-1 text-sm font-bold text-brand-700 hover:text-brand-900">
          <LogIn aria-hidden className="size-4" />
          Log in to collect runners and obstacles
        </Link>
      )}
      {SKIN_SLOTS.map((slot) => (
        <SlotRow key={slot} slot={slot} cosmetics={cosmetics} worn={outfit[slot].id} />
      ))}
      {cosmetics.signedIn && (
        <Link to={cosmetics.shopPath} className="inline-flex items-center gap-1 text-sm font-bold text-brand-700 hover:text-brand-900">
          <ShoppingBag aria-hidden className="size-4" />
          More in the shop
        </Link>
      )}
    </section>
  )
}

function SlotRow({ slot, cosmetics, worn }: { slot: SkinSlot; cosmetics: GameCosmetics; worn: string }) {
  const skins = (cosmetics.skins ?? []).filter((skin) => skin.slot === slot)
  const own = DEFAULT_OUTFIT[slot]

  return (
    <div role="radiogroup" aria-label={`${SLOT_LABELS[slot]} look`} className="flex flex-col gap-1.5">
      <p className="text-xs font-bold tracking-wide text-ink-soft uppercase">{SLOT_LABELS[slot]}</p>
      <div className="flex flex-wrap gap-1.5">
        <Choice
          label={own.name}
          slot={slot}
          skinId={own.id}
          selected={worn === own.id}
          onPick={() => cosmetics.equip(slot, null)}
          disabled={cosmetics.saving || !cosmetics.signedIn}
        />
        {skins.map((skin) => (
          <SkinChoice key={skin.itemId} skin={skin} slot={slot} cosmetics={cosmetics} selected={skin.equipped} />
        ))}
      </div>
    </div>
  )
}

function SkinChoice({ skin, slot, cosmetics, selected }: { skin: GameSkin; slot: SkinSlot; cosmetics: GameCosmetics; selected: boolean }) {
  const wearable = skin.wearable ?? skin.owned
  return (
    <Choice
      label={skin.name}
      slot={slot}
      skinId={skin.skinId}
      selected={selected}
      onPick={() => cosmetics.equip(slot, skin.itemId)}
      disabled={!wearable || cosmetics.saving}
      locked={!wearable ? skin.price : undefined}
    />
  )
}

interface ChoiceProps {
  label: string
  slot: SkinSlot
  skinId: string
  selected: boolean
  onPick: () => void
  disabled: boolean
  /** The price, for a skin the player does not have yet. */
  locked?: number
}

function Choice({ label, slot, skinId, selected, onPick, disabled, locked }: ChoiceProps) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      aria-label={locked !== undefined ? `${label} (in the shop)` : label}
      disabled={disabled && !selected}
      onClick={onPick}
      title={label}
      className={cn(
        'relative flex flex-col items-center gap-1 rounded-xl bg-surface p-1.5 ring-2 transition-colors disabled:cursor-not-allowed',
        selected ? 'ring-(--accent)' : 'ring-transparent hover:ring-line',
        locked !== undefined && 'opacity-60',
      )}
    >
      <SkinPreview slot={slot} skinId={skinId} className="h-11" />
      <span className="max-w-20 truncate text-[0.68rem] font-bold">{label}</span>
      {locked !== undefined && (
        <span className="flex items-center gap-0.5 text-[0.65rem]">
          <Lock aria-hidden className="size-3" />
          <CoinAmount amount={locked} className="text-[0.65rem]" />
        </span>
      )}
    </button>
  )
}
