import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import ts from 'typescript'
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

  it('loads JavaScript-only middleware artifacts for the homepage, favicons and protected assets', () => {
    const cache = resolve(process.cwd(), 'node_modules/.tmp')
    mkdirSync(cache, { recursive: true })
    const runtime = mkdtempSync(join(cache, 'middleware-runtime-'))
    try {
      for (const name of ['middleware', 'deployment']) {
        const source = readFileSync(resolve(process.cwd(), name + '.ts'), 'utf8')
        const { outputText } = ts.transpileModule(source, {
          fileName: name + '.ts',
          compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2023 },
        })
        writeFileSync(join(runtime, name + '.js'), outputText)
      }
      writeFileSync(join(runtime, 'package.json'), JSON.stringify({ type: 'module' }))
      const entry = pathToFileURL(join(runtime, 'middleware.js')).href
      const program = [
        'let calls = 0;',
        'globalThis.fetch = async () => { calls++; return new Response(null, { status: 403 }); };',
        'const { default: middleware } = await import(' + JSON.stringify(entry) + ');',
        'const results = [];',
        'for (const path of ["/", "/favicon.ico", "/favicon.png"]) {',
        '  const response = await middleware(new Request("https://arcade.example.invalid" + path));',
        '  results.push(response.headers.get("x-middleware-next"));',
        '}',
        'const publicCalls = calls;',
        'const denied = await middleware(new Request("https://arcade.example.invalid/assets/ai/chess.js"));',
        'console.log(JSON.stringify({ results, publicCalls, denied: denied.status }));',
      ].join('\n')
      const output = execFileSync(process.execPath, ['--input-type=module', '-e', program], {
        encoding: 'utf8',
        env: { ...process.env, BACKEND_ORIGIN: origin },
        timeout: 15_000,
      })
      expect(JSON.parse(output)).toEqual({ results: ['1', '1', '1'], publicCalls: 0, denied: 403 })
    } finally {
      // Only remove this test's freshly created directory inside the ignored cache.
      if (dirname(runtime) !== cache || !basename(runtime).startsWith('middleware-runtime-')) {
        throw new Error('Refusing to remove an unexpected runtime-test path')
      }
      rmSync(runtime, { recursive: true, force: true })
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
