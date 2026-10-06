import { Award, CircleUserRound, Package, Palette, Tag, type LucideIcon } from 'lucide-react'
import type { ItemType } from '@/api/economy'

export interface ShopCategory {
  type: ItemType
  /** How the category is written in the URL (`/shop?category=frames`). */
  slug: string
  /** The filter's label. */
  label: string
  title: string
  description: string
  icon: LucideIcon
  /** The colors of an item's picture in this category. */
  tile: string
}

/** The shop's categories, in the order the shop shows them. */
export const shopCategories: ShopCategory[] = [
  {
    type: 'PACK',
    slug: 'packs',
    label: 'Packs',
    title: 'Card packs',
    description: "Extra packs for when today's free ones run out. Open them from any booster in Cards.",
    icon: Package,
    tile: 'bg-linear-to-br from-purple-500 to-pink-500 text-white',
  },
  {
    type: 'BADGE',
    slug: 'badges',
    label: 'Badges',
    title: 'Badges',
    description: 'Pinned to your avatar on your profile. Wear one at a time.',
    icon: Award,
    tile: 'bg-linear-to-br from-amber-400 to-orange-500 text-white',
  },
  {
    type: 'TITLE',
    slug: 'titles',
    label: 'Titles',
    title: 'Titles',
    description: 'Shown under your name on your profile.',
    icon: Tag,
    tile: 'bg-linear-to-br from-sky-400 to-indigo-500 text-white',
  },
  {
    type: 'COSMETIC',
    slug: 'frames',
    label: 'Frames',
    title: 'Profile frames',
    description: 'A colourful ring around your avatar, for everyone who visits your profile.',
    icon: CircleUserRound,
    tile: 'bg-pink-50 text-pink-700 ring-2 ring-pink-200',
  },
  {
    type: 'GAME_SKIN',
    slug: 'skins',
    label: 'Game skins',
    title: 'Game skins',
    description: 'New looks for the games you play. Purely cosmetic: a skin never changes how a game plays.',
    icon: Palette,
    tile: 'bg-sky-50 text-sky-700 ring-2 ring-sky-200',
  },
]

/** The category in the URL, or `null` for everything. Anything unknown means everything. */
export function categoryFromSlug(slug: string | null): ShopCategory | null {
  return shopCategories.find((category) => category.slug === slug?.toLowerCase()) ?? null
}

export function categoryOf(type: ItemType): ShopCategory {
  return shopCategories.find((category) => category.type === type) ?? shopCategories[0]
}
