import { Palette } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { SKIN_SLOTS, SLOT_LABELS, type Outfit } from '../skins'
import { SkinPreview } from './SkinPreview'

interface LookSummaryProps {
  outfit: Outfit
  onCustomize: () => void
}

/** What the player is flying with (bird, obstacles, sky) and the way into the skin picker. */
export function LookSummary({ outfit, onCustomize }: LookSummaryProps) {
  return (
    <section aria-labelledby="flappy-look" className="flex flex-col gap-3 rounded-control bg-surface-muted p-3">
      <div className="flex items-center justify-between gap-2">
        <h2 id="flappy-look" className="font-display text-base font-semibold">
          Your look
        </h2>
        <Button size="sm" variant="secondary" onClick={onCustomize}>
          <Palette aria-hidden className="size-4" />
          Customize
        </Button>
      </div>
      <dl className="grid grid-cols-3 gap-2">
        {SKIN_SLOTS.map((slot) => (
          <div key={slot} className="flex min-w-0 flex-col items-center gap-1 rounded-xl bg-surface p-2 text-center">
            <SkinPreview slot={slot} skinId={outfit[slot].id} className="h-11" />
            <dt className="text-[0.7rem] font-bold tracking-wide text-ink-soft uppercase">{SLOT_LABELS[slot]}</dt>
            <dd className="w-full text-xs leading-tight font-bold break-words">{outfit[slot].name}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
