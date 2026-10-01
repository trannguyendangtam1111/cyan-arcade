import type { AvatarKey } from '@/api/auth'
import { cn } from '@/lib/cn'
import { AVATARS } from './avatars'

type Size = 'sm' | 'md' | 'lg'

const sizes: Record<Size, { box: string; icon: string }> = {
  sm: { box: 'size-7', icon: 'size-4' },
  md: { box: 'size-10', icon: 'size-6' },
  lg: { box: 'size-24 ring-4 ring-surface shadow-soft', icon: 'size-12' },
}

interface AvatarProps {
  avatar: AvatarKey
  size?: Size
  className?: string
}

/** A player's avatar: a friendly icon on a coloured disc. Decorative; put the name next to it. */
export function Avatar({ avatar, size = 'md', className }: AvatarProps) {
  // An avatar this version of the app does not know (added on the server later) falls back to the default.
  const { icon: Icon, color } = AVATARS[avatar] ?? AVATARS.ROBOT
  return (
    <span
      aria-hidden
      className={cn('grid shrink-0 place-items-center rounded-full text-white', color, sizes[size].box, className)}
    >
      <Icon className={sizes[size].icon} strokeWidth={2} />
    </span>
  )
}
