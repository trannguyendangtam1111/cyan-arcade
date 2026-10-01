import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, apiFetch, NETWORK_ERROR } from './client'

function mockFetch(response: Response | Error) {
  return vi
    .spyOn(globalThis, 'fetch')
    .mockImplementation(() => (response instanceof Error ? Promise.reject(response) : Promise.resolve(response)))
}

const json = (body: unknown, status = 200, contentType = 'application/json') =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': contentType } })

/** Removes the CSRF cookie, as in a browser that has not talked to the API yet. */
function clearCsrfCookie() {
  document.cookie = 'XSRF-TOKEN=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT'
}

describe('apiFetch', () => {
  beforeEach(() => {
    document.cookie = 'XSRF-TOKEN=token-from-cookie; path=/'
  })

  it('returns parsed JSON on success', async () => {
    mockFetch(json({ status: 'UP' }))
    await expect(apiFetch('/actuator/health')).resolves.toEqual({ status: 'UP' })
  })

  it('serialises a body and sets the JSON content type', async () => {
    const fetchSpy = mockFetch(json({ id: 1 }, 201))
    await apiFetch('/api/game-sessions', { method: 'POST', body: { gameSlug: 'snake' } })

    const [, init] = fetchSpy.mock.calls[0]
    expect(init?.body).toBe('{"gameSlug":"snake"}')
    expect(init?.headers).toMatchObject({ 'Content-Type': 'application/json' })
  })

  it('returns undefined for 204 No Content', async () => {
    mockFetch(new Response(null, { status: 204 }))
    await expect(apiFetch('/api/something')).resolves.toBeUndefined()
  })

  it('turns a problem-detail response into an ApiError', async () => {
    mockFetch(
      json(
        {
          status: 400,
          title: 'Bad Request',
          detail: 'Request validation failed',
          code: 'VALIDATION_FAILED',
          errors: [{ field: 'score', message: 'must be greater than or equal to 0' }],
        },
        400,
        'application/problem+json',
      ),
    )

    const error = await apiFetch('/api/x').catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({
      status: 400,
      code: 'VALIDATION_FAILED',
      message: 'Request validation failed',
      fieldErrors: [{ field: 'score', message: 'must be greater than or equal to 0' }],
      isClientError: true,
    })
  })

  it('falls back to the HTTP status when the error body is not JSON', async () => {
    mockFetch(new Response('<html>Bad gateway</html>', { status: 502, statusText: 'Bad Gateway' }))

    const error = await apiFetch('/api/x').catch((e: unknown) => e)
    expect(error).toMatchObject({ status: 502, code: 'HTTP_502', message: 'Bad Gateway', isClientError: false })
  })

  it('reports an unreachable server as a network error', async () => {
    mockFetch(new TypeError('Failed to fetch'))

    const error = await apiFetch('/api/x').catch((e: unknown) => e)
    expect(error).toMatchObject({ status: 0, code: NETWORK_ERROR })
  })
})

describe('CSRF protection', () => {
  beforeEach(() => {
    document.cookie = 'XSRF-TOKEN=token-from-cookie; path=/'
  })

  it.each(['POST', 'PATCH', 'PUT', 'DELETE'])('sends the token from the cookie with a %s request', async (method) => {
    const fetchSpy = mockFetch(json({ ok: true }))
    await apiFetch('/api/anything', { method, body: {} })

    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(fetchSpy.mock.calls[0][1]?.headers).toMatchObject({ 'X-XSRF-TOKEN': 'token-from-cookie' })
  })

  it('does not send the token with requests that only read', async () => {
    const fetchSpy = mockFetch(json({ ok: true }))
    await apiFetch('/api/games')

    expect(fetchSpy.mock.calls[0][1]?.headers).not.toHaveProperty('X-XSRF-TOKEN')
  })

  it('uses the newest token, because the server replaces it at sign-in', async () => {
    // A response body can be read once, so each call gets its own response.
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => json({ ok: true }))
    await apiFetch('/api/first', { method: 'POST' })
    document.cookie = 'XSRF-TOKEN=token-after-login; path=/'
    await apiFetch('/api/second', { method: 'POST' })

    expect(fetchSpy.mock.calls[1][1]?.headers).toMatchObject({ 'X-XSRF-TOKEN': 'token-after-login' })
  })

  it('fetches a token first when the browser has none yet', async () => {
    clearCsrfCookie()
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      // The real server sets the cookie on any response; the first call is the one that asks for it.
      if (String(input) === '/api/auth/session') document.cookie = 'XSRF-TOKEN=fresh-token; path=/'
      return json({ ok: true })
    })

    await apiFetch('/api/game-sessions', { method: 'POST', body: { gameSlug: 'snake' } })

    expect(fetchSpy.mock.calls.map(([input]) => String(input))).toEqual(['/api/auth/session', '/api/game-sessions'])
    expect(fetchSpy.mock.calls[1][1]?.headers).toMatchObject({ 'X-XSRF-TOKEN': 'fresh-token' })
  })

  it('sends cookies only to its own origin', async () => {
    const fetchSpy = mockFetch(json({ ok: true }))
    await apiFetch('/api/users/me')

    expect(fetchSpy.mock.calls[0][1]?.credentials).toBe('same-origin')
  })
})
