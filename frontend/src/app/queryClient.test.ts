import { describe, expect, it } from 'vitest'
import { ApiError } from '@/api/client'
import { createQueryClient } from './queryClient'

/** The retry decision the app's query client makes after a failure. */
function shouldRetry(failureCount: number, error: Error): boolean {
  const retry = createQueryClient().getDefaultOptions().queries?.retry
  if (typeof retry !== 'function') throw new Error('The query client should decide retries with a function')
  return retry(failureCount, error)
}

describe('query client', () => {
  it.each([400, 401, 403, 404, 409, 429])('does not retry a %i: asking again gets the same answer', (status) => {
    expect(shouldRetry(0, new ApiError(status, 'SOME_CODE', 'No'))).toBe(false)
  })

  it('retries a server error or an unreachable server, twice at most', () => {
    const unreachable = new ApiError(0, 'NETWORK_ERROR', 'Could not reach the server')
    const serverError = new ApiError(503, 'HTTP_503', 'Unavailable')

    for (const error of [unreachable, serverError, new Error('anything else')]) {
      expect(shouldRetry(0, error)).toBe(true)
      expect(shouldRetry(1, error)).toBe(true)
      expect(shouldRetry(2, error)).toBe(false)
    }
  })

  it('does not refetch just because the window got focus', () => {
    expect(createQueryClient().getDefaultOptions().queries?.refetchOnWindowFocus).toBe(false)
  })
})
