import { RotateCcw, Unplug } from 'lucide-react'
import { Button } from './Button'
import { EmptyState } from './EmptyState'

interface ErrorStateProps {
  title?: string
  description?: string
  onRetry?: () => void
}

/** Friendly failure placeholder for a section whose data could not be loaded. */
export function ErrorState({
  title = 'The arcade lost its connection',
  description = "We couldn't reach the server. Check that it's running and try again.",
  onRetry,
}: ErrorStateProps) {
  return (
    <div role="alert">
      <EmptyState
        icon={Unplug}
        title={title}
        description={description}
        action={
          onRetry && (
            <Button variant="secondary" onClick={onRetry}>
              <RotateCcw aria-hidden className="size-4" />
              Try again
            </Button>
          )
        }
      />
    </div>
  )
}
