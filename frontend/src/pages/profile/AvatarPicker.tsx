import type { AvatarKey } from '@/api/auth'
import { useUpdateAvatar } from '@/api/profile'
import { Avatar } from '@/components/ui/Avatar'
import { AVATAR_KEYS, AVATARS } from '@/components/ui/avatars'
import { Modal } from '@/components/ui/Modal'
import { cn } from '@/lib/cn'

interface AvatarPickerProps {
  current: AvatarKey
  open: boolean
  onClose: () => void
}

/** A dialog for choosing one of the available avatars. Choosing saves straight away. */
export function AvatarPicker({ current, open, onClose }: AvatarPickerProps) {
  const update = useUpdateAvatar()

  const choose = (avatar: AvatarKey) => {
    if (avatar === current) {
      onClose()
      return
    }
    update.mutate(avatar, { onSuccess: onClose })
  }

  return (
    <Modal open={open} onClose={onClose} title="Choose your avatar">
      <ul className="grid grid-cols-4 gap-3">
        {AVATAR_KEYS.map((avatar) => {
          const selected = avatar === current
          return (
            <li key={avatar} className="flex justify-center">
              <button
                type="button"
                aria-label={AVATARS[avatar].label}
                aria-pressed={selected}
                disabled={update.isPending}
                onClick={() => choose(avatar)}
                className={cn(
                  'rounded-full p-1 ring-4 transition-all hover:scale-110 disabled:opacity-60',
                  selected ? 'ring-brand-500' : 'ring-transparent hover:ring-brand-200',
                )}
              >
                <Avatar avatar={avatar} size="md" className="size-14 [&>svg]:size-8" />
              </button>
            </li>
          )
        })}
      </ul>
      {update.isError && (
        <p role="alert" className="mt-4 font-bold text-rose-700">
          Couldn't save your avatar. Please try again.
        </p>
      )}
    </Modal>
  )
}
