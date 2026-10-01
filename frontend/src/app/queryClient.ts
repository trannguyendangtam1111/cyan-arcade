import { QueryClient } from '@tanstack/react-query'
import { ApiError } from '@/api/client'

const MAX_RETRIES = 2

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: false,
        // Retrying a 4xx never helps; retry only network and server hiccups.
        retry: (failureCount, error) =>
          !(error instanceof ApiError && error.isClientError) && failureCount < MAX_RETRIES,
      },
    },
  })
}
