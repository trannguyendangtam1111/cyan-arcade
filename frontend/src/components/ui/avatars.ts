import { Bird, Bot, Cat, Crown, Dog, Fish, Ghost, Rocket, type LucideIcon } from 'lucide-react'
import type { AvatarKey } from '@/api/auth'

/** How each avatar the server knows about is drawn. */
export const AVATARS: Record<AvatarKey, { label: string; icon: LucideIcon; color: string }> = {
  ROBOT: { label: 'Robot', icon: Bot, color: 'bg-cyan-500' },
  CAT: { label: 'Cat', icon: Cat, color: 'bg-amber-500' },
  DOG: { label: 'Dog', icon: Dog, color: 'bg-orange-500' },
  GHOST: { label: 'Ghost', icon: Ghost, color: 'bg-violet-500' },
  ROCKET: { label: 'Rocket', icon: Rocket, color: 'bg-rose-500' },
  CROWN: { label: 'Crown', icon: Crown, color: 'bg-yellow-500' },
  BIRD: { label: 'Bird', icon: Bird, color: 'bg-sky-500' },
  FISH: { label: 'Fish', icon: Fish, color: 'bg-emerald-500' },
}

export const AVATAR_KEYS = Object.keys(AVATARS) as AvatarKey[]
