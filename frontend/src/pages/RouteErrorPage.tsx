import { RotateCcw, ZapOff } from 'lucide-react'
import type { ReactNode } from 'react'
import { isRouteErrorResponse, useRouteError } from 'react-router'
import { Logo } from '@/components/brand/Logo'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { NotFoundPage } from './NotFoundPage'

/** Last-resort boundary for errors thrown while rendering or loading a route. */
export function RouteErrorPage() {
  const error = useRouteError()

  if (isRouteErrorResponse(error) && error.status === 404) {
    return (
      <Shell>
        <NotFoundPage />
      </Shell>
    )
  }

  if (import.meta.env.DEV) console.error(error)

  return (
    <Shell>
      <EmptyState
        icon={ZapOff}
        title="Oops, a cabinet short-circuited"
        description="Something unexpected happened. Reloading usually gets things running again."
        action={
          <Button onClick={() => window.location.reload()}>
            <RotateCcw aria-hidden className="size-4" />
            Reload
          </Button>
        }
      />
    </Shell>
  )
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-2xl flex-col justify-center gap-8 px-4 py-10">
      <div className="flex justify-center">
        <Logo />
      </div>
      {children}
    </div>
  )
}
