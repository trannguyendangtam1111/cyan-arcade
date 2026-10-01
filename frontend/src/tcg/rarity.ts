/**
 * How each rarity tier looks. Tiers (1 to 5) are the one thing about rarities that every card game
 * shares, so styling goes by tier and never by a game's own rarity names.
 */
export interface TierStyle {
  /** Badge colors. */
  badge: string
  /** Ring and glow around a card of this tier. */
  frame: string
  /** The color of the burst when a card of this tier is revealed; empty for ordinary cards. */
  burst: string
}

const TIERS: Record<number, TierStyle> = {
  1: { badge: 'bg-slate-100 text-slate-700', frame: 'ring-1 ring-ink/10', burst: '' },
  2: { badge: 'bg-teal-100 text-teal-800', frame: 'ring-2 ring-teal-300', burst: '' },
  3: {
    badge: 'bg-blue-100 text-blue-800',
    frame: 'ring-2 ring-blue-400 shadow-[0_0_18px_rgb(59_130_246/0.45)]',
    burst: 'border-blue-400',
  },
  4: {
    badge: 'bg-purple-100 text-purple-800',
    frame: 'ring-[3px] ring-purple-400 shadow-[0_0_26px_rgb(168_85_247/0.6)]',
    burst: 'border-fuchsia-400',
  },
  5: {
    badge: 'bg-amber-100 text-amber-900',
    frame: 'ring-[3px] ring-amber-400 shadow-[0_0_30px_rgb(245_158_11/0.7)]',
    burst: 'border-amber-400',
  },
}

/** Tiers outside 1 to 5 (a newer server, say) fall back to the nearest one. */
export function tierStyle(tier: number): TierStyle {
  return TIERS[Math.min(5, Math.max(1, Math.round(tier)))]
}

/** From this tier on a card gets a glow, a burst on reveal, and a mention in the results. */
export const SPECIAL_TIER = 3

/** The rarest tier: these cards shimmer. */
export const TOP_TIER = 5
