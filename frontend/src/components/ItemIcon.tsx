import { Boxes, Coins, Crown, Dices, Layers, Package, PackagePlus, Sparkles, Star, Trophy, type LucideIcon } from 'lucide-react'

/** The pictures the shop's `icon` names stand for. Anything unknown gets a sparkle. */
const itemIcons: Record<string, LucideIcon> = {
  package: Package,
  packages: Boxes,
  box: PackagePlus,
  coin: Coins,
  star: Star,
  crown: Crown,
  dice: Dices,
  cards: Layers,
  trophy: Trophy,
}

/** The picture of a shop item (a pack, a badge, a title), from the name the server gives it. */
export function ItemIcon({ icon, className }: { icon: string; className?: string }) {
  const Icon = itemIcons[icon] ?? Sparkles
  return <Icon aria-hidden className={className} />
}
