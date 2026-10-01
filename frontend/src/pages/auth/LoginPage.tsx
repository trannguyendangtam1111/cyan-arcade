import { Link, useLocation } from 'react-router'
import { INVALID_CREDENTIALS, TOO_MANY_LOGIN_ATTEMPTS, useLogin } from '@/api/auth'
import { ApiError } from '@/api/client'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { AuthField, AuthForm } from './AuthForm'

function messageFor(error: unknown): string | null {
  if (!error) return null
  if (error instanceof ApiError && error.code === INVALID_CREDENTIALS) return 'Wrong username or password.'
  if (error instanceof ApiError && error.code === TOO_MANY_LOGIN_ATTEMPTS) {
    return 'Too many failed attempts. Please wait a few minutes and try again.'
  }
  if (error instanceof ApiError && error.status === 0) return "Couldn't reach the server. Please try again."
  return 'Something went wrong. Please try again.'
}

export function LoginPage() {
  useDocumentTitle('Log in')
  const login = useLogin()
  const { search } = useLocation()

  return (
    <AuthForm
      title="Welcome back!"
      subtitle="Log in to pick up where you left off."
      submitLabel="Log in"
      pendingLabel="Logging in…"
      pending={login.isPending}
      error={messageFor(login.error)}
      onSubmit={login.mutate}
      footer={
        <>
          New to the arcade?{' '}
          {/* Keep the "where to go afterwards" parameter when switching between the two pages. */}
          <Link to={`/register${search}`} className="rounded font-bold text-brand-700 hover:text-brand-900">
            Create an account
          </Link>
        </>
      }
    >
      <AuthField label="Username" name="username" autoComplete="username" required />
      <AuthField label="Password" name="password" type="password" autoComplete="current-password" required />
    </AuthForm>
  )
}
