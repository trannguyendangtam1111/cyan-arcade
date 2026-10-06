import { Check } from 'lucide-react'
import { useId, useState, type FormEvent } from 'react'
import type { AvatarKey } from '@/api/auth'
import { ApiError } from '@/api/client'
import { BIO_MAX_LENGTH, DISPLAY_NAME_LENGTH, useUpdateProfile, type ProfileChange } from '@/api/profile'
import { Avatar } from '@/components/ui/Avatar'
import { AVATAR_KEYS, AVATARS } from '@/components/ui/avatars'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { cn } from '@/lib/cn'

interface EditProfileDialogProps {
  open: boolean
  onClose: () => void
  /** What the profile shows now. */
  current: { displayName: string; bio: string | null; avatar: AvatarKey }
  /** Called once the server has saved the change. */
  onSaved?: () => void
}

const DISPLAY_NAME_PATTERN = /^[\p{L}\p{M}\p{N} ._'!-]*$/u

/**
 * Changing what the player shows of themselves: display name, bio and avatar. The username is
 * their identity and is not editable here. The checks below only help before sending; the server
 * checks again and has the last word.
 */
export function EditProfileDialog({ open, onClose, current, onSaved }: EditProfileDialogProps) {
  return (
    <Modal open={open} onClose={onClose} title="Edit profile">
      {/* Mounted only while open, so it starts from what the profile shows each time. */}
      {open && <EditProfileForm current={current} onCancel={onClose} onSaved={() => (onSaved ?? onClose)()} />}
    </Modal>
  )
}

interface EditProfileFormProps {
  current: EditProfileDialogProps['current']
  onCancel: () => void
  onSaved: () => void
}

function EditProfileForm({ current, onCancel, onSaved }: EditProfileFormProps) {
  const update = useUpdateProfile()
  const [displayName, setDisplayName] = useState(current.displayName)
  const [bio, setBio] = useState(current.bio ?? '')
  const [avatar, setAvatar] = useState<AvatarKey>(current.avatar)
  const [touched, setTouched] = useState(false)
  const nameId = useId()
  const bioId = useId()

  const trimmedName = displayName.trim().replace(/\s+/g, ' ')
  let nameError: string | null = null
  if (trimmedName.length < DISPLAY_NAME_LENGTH.min || trimmedName.length > DISPLAY_NAME_LENGTH.max) {
    nameError = `Use ${DISPLAY_NAME_LENGTH.min} to ${DISPLAY_NAME_LENGTH.max} characters.`
  } else if (!DISPLAY_NAME_PATTERN.test(trimmedName)) {
    nameError = "Use letters, digits, spaces and . _ ' ! - only."
  }
  const bioError = bio.trim().length > BIO_MAX_LENGTH ? `Keep it to ${BIO_MAX_LENGTH} characters.` : null

  // What the server said about each field, if it refused.
  const serverErrors = update.error instanceof ApiError ? update.error.fieldErrors : []
  const serverError = (field: string) => serverErrors.find((error) => error.field === field)?.message
  const generalError =
    update.error && serverErrors.length === 0
      ? update.error instanceof ApiError
        ? update.error.message
        : "Couldn't save your profile. Please try again."
      : null

  const submit = (event: FormEvent) => {
    event.preventDefault()
    setTouched(true)
    if (nameError || bioError) return
    // Only what changed is sent.
    const change: ProfileChange = {}
    if (trimmedName !== current.displayName) change.displayName = trimmedName
    if (bio.trim() !== (current.bio ?? '')) change.bio = bio.trim()
    if (avatar !== current.avatar) change.avatar = avatar
    if (Object.keys(change).length === 0) {
      onCancel()
      return
    }
    update.mutate(change, { onSuccess: onSaved })
  }

  const nameMessage = (touched && nameError) || serverError('displayName')
  const bioMessage = bioError ?? serverError('bio')

  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-5 text-left text-ink">
      <fieldset>
        <legend className="mb-2 text-sm font-bold">Avatar</legend>
        <ul className="grid grid-cols-4 gap-2">
          {AVATAR_KEYS.map((key) => (
            <li key={key} className="flex justify-center">
              <button
                type="button"
                aria-label={AVATARS[key].label}
                aria-pressed={key === avatar}
                onClick={() => setAvatar(key)}
                className={cn(
                  'relative rounded-full p-1 ring-4 transition-all hover:scale-110 active:scale-95',
                  key === avatar ? 'ring-brand-500' : 'ring-transparent hover:ring-brand-200',
                )}
              >
                <Avatar avatar={key} size="md" className="size-12 [&>svg]:size-7" />
                {key === avatar && (
                  <span className="absolute -right-1 -bottom-1 grid size-5 place-items-center rounded-full bg-brand-500 text-brand-950 motion-safe:animate-pop-in">
                    <Check aria-hidden className="size-3.5" strokeWidth={3} />
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      </fieldset>

      <div className="flex flex-col gap-1">
        <label htmlFor={nameId} className="flex items-baseline justify-between text-sm font-bold">
          Display name
          <span className="font-normal text-ink-soft tabular-nums">
            {trimmedName.length}/{DISPLAY_NAME_LENGTH.max}
          </span>
        </label>
        <input
          id={nameId}
          value={displayName}
          maxLength={DISPLAY_NAME_LENGTH.max + 8}
          onChange={(event) => setDisplayName(event.target.value)}
          onBlur={() => setTouched(true)}
          aria-invalid={Boolean(nameMessage)}
          aria-describedby={`${nameId}-hint`}
          className="h-11 rounded-control bg-surface px-4 ring-2 ring-line focus:ring-brand-400 focus:outline-none aria-invalid:ring-rose-400"
        />
        <p id={`${nameId}-hint`} className={cn('text-sm', nameMessage ? 'font-bold text-rose-700' : 'text-ink-soft')}>
          {nameMessage || 'What other players see. Your username stays the same.'}
        </p>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor={bioId} className="flex items-baseline justify-between text-sm font-bold">
          Bio
          <span className={cn('font-normal tabular-nums', bioError ? 'text-rose-700' : 'text-ink-soft')}>
            {bio.trim().length}/{BIO_MAX_LENGTH}
          </span>
        </label>
        <textarea
          id={bioId}
          value={bio}
          rows={3}
          onChange={(event) => setBio(event.target.value)}
          aria-invalid={Boolean(bioMessage)}
          placeholder="A few words about you (optional)"
          className="resize-none rounded-control bg-surface px-4 py-2 ring-2 ring-line focus:ring-brand-400 focus:outline-none aria-invalid:ring-rose-400"
        />
        {bioMessage && <p className="text-sm font-bold text-rose-700">{bioMessage}</p>}
      </div>

      {generalError && (
        <p role="alert" className="font-bold text-rose-700">
          {generalError}
        </p>
      )}

      <div className="flex flex-wrap justify-end gap-3">
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={update.isPending}>
          {update.isPending ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </form>
  )
}
