import { Link, useLocation } from 'react-router'
import { USERNAME_TAKEN, useRegister } from '@/api/auth'
import { ApiError } from '@/api/client'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { AuthField, AuthForm } from './AuthForm'

/** Sorts a failed registration into messages per field and one for the form as a whole. */
function describe(error: unknown): { username?: string; password?: string; form?: string } {
  if (!error) return {}
  if (!(error instanceof ApiError)) return { form: 'Something went wrong. Please try again.' }
  if (error.code === USERNAME_TAKEN) return { username: 'That username is already taken.' }
  if (error.status === 0) return { form: "Couldn't reach the server. Please try again." }

  const field = (name: string) => error.fieldErrors.find((fieldError) => fieldError.field === name)?.message
  const username = field('username')
  const password = field('password')
  if (username || password) {
    return {
      username: username && `Username ${username}.`,
      password: password && `Password ${password}.`,
    }
  }
  return { form: 'Something went wrong. Please try again.' }
}

export function RegisterPage() {
  useDocumentTitle('Create account')
  const register = useRegister()
  const { search } = useLocation()
  const problems = describe(register.error)

  return (
    <AuthForm
      title="Join the arcade"
      subtitle="Earn XP, unlock achievements and put your name on the leaderboard."
      submitLabel="Create account"
      pendingLabel="Creating account…"
      pending={register.isPending}
      error={problems.form}
      onSubmit={register.mutate}
      footer={
        <>
          Already have an account?{' '}
          <Link to={`/login${search}`} className="rounded font-bold text-brand-700 hover:text-brand-900">
            Log in
          </Link>
        </>
      }
    >
      <AuthField
        label="Username"
        name="username"
        autoComplete="username"
        hint="3 to 20 letters, digits or underscores. Other players see this name."
        error={problems.username}
        minLength={3}
        maxLength={20}
        pattern="[A-Za-z0-9_]{3,20}"
        required
      />
      <AuthField
        label="Password"
        name="password"
        type="password"
        autoComplete="new-password"
        hint="At least 8 characters."
        error={problems.password}
        minLength={8}
        maxLength={72}
        required
      />
    </AuthForm>
  )
}
