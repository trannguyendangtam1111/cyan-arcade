import type { AvatarKey } from '@/api/auth'
import { Avatar } from '@/components/ui/Avatar'
import { cn } from '@/lib/cn'

/** The look of each profile frame, by the `icon` the shop gives it. */
const frames: Record<string, string> = {
  'frame-bubblegum': 'from-pink-300 via-pink-400 to-rose-500',
  'frame-ocean': 'from-cyan-300 via-sky-400 to-blue-500',
  'frame-rainbow': 'from-rose-400 via-amber-300 to-violet-500',
  'frame-gold': 'from-yellow-200 via-amber-400 to-amber-600',
}

interface FramedAvatarProps {
  avatar: AvatarKey
  /** The frame worn (a shop cosmetic), or none. A frame this version of the app does not know is left out. */
  frame?: { icon: string } | null
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

/** A player's avatar inside the frame they wear, if any. Decorative, like the avatar. */
export function FramedAvatar({ avatar, frame, size = 'md', className }: FramedAvatarProps) {
  const gradient = frame ? frames[frame.icon] : undefined
  if (!gradient) return <Avatar avatar={avatar} size={size} className={className} />
  return (
    <span
      aria-hidden
      data-frame={frame?.icon}
      className={cn(
        'inline-grid shrink-0 rounded-full bg-linear-to-br shadow-soft',
        gradient,
        size === 'lg' ? 'p-2' : 'p-1',
        className,
      )}
    >
      <Avatar avatar={avatar} size={size} className={size === 'lg' ? undefined : 'ring-2 ring-surface'} />
    </span>
  )
}
