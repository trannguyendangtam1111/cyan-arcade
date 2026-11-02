import { afterEach, describe, expect, it, vi } from 'vitest'
import { backendOrigin, vercelConfiguration } from '../deployment'
import middleware, { config as middlewareConfig } from '../middleware'

const origin = 'https://backend.example.invalid'
const request = (path: string, method = 'GET') => new Request('https://arcade.example.invalid' + path, {
  method,
  headers: { Cookie: 'CYAN_SESSION=test-session; XSRF-TOKEN=test-csrf' },
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('Vercel deployment boundary', () => {
  it('preserves API/health paths before the SPA fallback and keeps responses private', () => {
    const config = vercelConfiguration({ BACKEND_ORIGIN: origin })
    expect(config.rewrites).toEqual([
      { source: '/api/:path*', destination: origin + '/api/:path*' },
      { source: '/actuator/health', destination: origin + '/actuator/health' },
      { source: '/(.*)', destination: '/index.html' },
    ])
    expect(config.headers?.find((rule) => rule.source === '/api/:path*')?.headers)
      .toContainEqual({ key: 'Cache-Control', value: 'private, no-store' })
    expect(middlewareConfig.matcher).toBe('/(.*)')
  })

  it('evaluates the actual Vercel config using only the server environment', async () => {
    vi.stubEnv('BACKEND_ORIGIN', origin)
    vi.stubEnv('VITE_API_BASE_URL', '')
    const { config } = await import('../vercel')
    expect(config.rewrites).toEqual(vercelConfiguration({ BACKEND_ORIGIN: origin }).rewrites)
  })

  it('fails configuration closed for a missing origin or cross-site browser API URL', () => {
    expect(() => vercelConfiguration({})).toThrow('BACKEND_ORIGIN')
    expect(() => vercelConfiguration({ BACKEND_ORIGIN: origin, VITE_API_BASE_URL: origin }))
      .toThrow('same-origin')
    for (const value of ['http://backend.invalid', origin + '/api', origin + '?key=x',
      'https://user:password@backend.invalid']) {
      expect(() => backendOrigin(value)).toThrow()
    }
  })

  it('leaves normal assets and API requests to the normal routing rules', async () => {
    const upstream = vi.fn()
    vi.stubGlobal('fetch', upstream)
    for (const path of ['/assets/index.js', '/api/auth/session', '/games/chess']) {
      expect((await middleware(request(path))).headers.get('x-middleware-next')).toBe('1')
    }
    expect(upstream).not.toHaveBeenCalled()
  })

  it.each([401, 403])('denies private AI assets when Spring returns %s, including encoded paths', async (status) => {
    vi.stubEnv('BACKEND_ORIGIN', origin)
    const upstream = vi.fn().mockResolvedValue(new Response(null, { status }))
    vi.stubGlobal('fetch', upstream)
    for (const path of ['/assets/ai/chess.js', '/%61ssets/%61i/chess.js', '/assets//ai/chess.js']) {
      const response = await middleware(request(path))
      expect(response.status).toBe(status)
      expect(response.headers.get('x-middleware-next')).toBeNull()
      expect(response.headers.get('Cache-Control')).toBe('private, no-store')
    }
    expect(upstream).toHaveBeenCalledWith(origin + '/api/ai/access', expect.objectContaining({
      headers: { Cookie: 'CYAN_SESSION=test-session; XSRF-TOKEN=test-csrf' },
      redirect: 'manual',
      cache: 'no-store',
    }))
  })

  it('serves an authorized chunk without shared or browser caching', async () => {
    vi.stubEnv('BACKEND_ORIGIN', origin)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 204 })))
    const response = await middleware(request('/assets/ai/chess.js'))
    expect(response.headers.get('x-middleware-next')).toBe('1')
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
    expect(response.headers.get('Vercel-CDN-Cache-Control')).toBe('no-store')
  })

  it.each([200, 302, 500])('fails closed for an unexpected authorization status %s', async (status) => {
    vi.stubEnv('BACKEND_ORIGIN', origin)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status })))
    expect((await middleware(request('/assets/ai/chess.js'))).status).toBe(503)
  })

  it('fails closed on backend failure, missing configuration, malformed encoding and non-read requests', async () => {
    vi.stubEnv('BACKEND_ORIGIN', origin)
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('upstream unavailable')))
    expect((await middleware(request('/assets/ai/chess.js'))).status).toBe(503)
    vi.stubEnv('BACKEND_ORIGIN', '')
    expect((await middleware(request('/assets/ai/chess.js'))).status).toBe(503)
    expect((await middleware(request('/assets/%2561i/chess.js'))).status).toBe(400)
    expect((await middleware(request('/assets/ai/chess.js', 'POST'))).status).toBe(405)
  })
})
