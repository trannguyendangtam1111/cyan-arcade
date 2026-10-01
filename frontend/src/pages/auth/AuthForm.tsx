import { CircleAlert } from 'lucide-react'
import { useId, type FormEvent, type InputHTMLAttributes, type ReactNode } from 'react'
import { Navigate, useSearchParams } from 'react-router'
import { useSession, type Credentials } from '@/api/auth'
import { Logo } from '@/components/brand/Logo'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { LoadingState } from '@/components/ui/LoadingState'

interface AuthFormProps {
  title: string
  subtitle: string
  submitLabel: string
  /** Shown on the button while the request is in flight. */
  pendingLabel: string
  pending: boolean
  /** A problem with the whole attempt (wrong password, server unreachable), not with one field. */
  error?: string | null
  onSubmit: (credentials: Credentials) => void
  /** The form fields; use {@link AuthField} with the names `username` and `password`. */
  children: ReactNode
  /** Link to the other auth page ("No account yet? ..."). */
  footer: ReactNode
}

/**
 * Where to go after signing in: the page that sent the player here, or their profile.
 * Only paths on this site are accepted, so a crafted link cannot send someone elsewhere.
 */
function useRedirectTarget(): string {
  const [params] = useSearchParams()
  const target = params.get('redirect')
  return target && target.startsWith('/') && !target.startsWith('//') ? target : '/profile'
}

/** Shared shell of the login and register pages. */
export function AuthForm({
  title,
  subtitle,
  submitLabel,
  pendingLabel,
  pending,
  error,
  onSubmit,
  children,
  footer,
}: AuthFormProps) {
  const { user, isPending: sessionPending } = useSession()
  const redirectTo = useRedirectTarget()

  if (sessionPending) return <LoadingState />
  // Covers both "already signed in" and "just signed in": the session changes, and we leave.
  if (user) return <Navigate to={redirectTo} replace />

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    onSubmit({ username: String(form.get('username') ?? '').trim(), password: String(form.get('password') ?? '') })
  }

  return (
    <div className="mx-auto flex w-full max-w-md flex-col items-center gap-6 py-4 sm:py-10">
      <Logo />
      <Card padding="lg" className="w-full">
        <h1 className="text-2xl font-bold">{title}</h1>
        <p className="mt-1 text-ink-soft">{subtitle}</p>

        <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
          {error && (
            <p role="alert" className="flex items-start gap-2 rounded-control bg-rose-50 px-4 py-3 text-rose-800">
              <CircleAlert aria-hidden className="mt-0.5 size-5 shrink-0" />
              {error}
            </p>
          )}
          {children}
          <Button type="submit" size="lg" className="mt-2 w-full" disabled={pending}>
            {pending ? pendingLabel : submitLabel}
          </Button>
        </form>
      </Card>
      <p className="text-ink-soft">{footer}</p>
    </div>
  )
}

interface AuthFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string
  hint?: string
  /** A message from the server about this field. */
  error?: string
}

export function AuthField({ label, hint, error, ...inputProps }: AuthFieldProps) {
  const id = useId()
  const hintId = `${id}-hint`
  const errorId = `${id}-error`

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="font-bold">
        {label}
      </label>
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={[error && errorId, hint && hintId].filter(Boolean).join(' ') || undefined}
        className="h-12 rounded-control border-2 border-line bg-surface px-4 transition-colors placeholder:text-ink-soft/60 hover:border-brand-300 focus:border-brand-500 aria-invalid:border-danger"
        {...inputProps}
      />
      {error && (
        <p id={errorId} className="text-sm font-bold text-rose-700">
          {error}
        </p>
      )}
      {hint && (
        <p id={hintId} className="text-sm text-ink-soft">
          {hint}
        </p>
      )}
    </div>
  )
}
