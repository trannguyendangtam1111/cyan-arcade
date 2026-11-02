import type { VercelConfig } from '@vercel/config/v1'

export const PRIVATE_HEADERS = {
  'Cache-Control': 'private, no-store',
  'CDN-Cache-Control': 'no-store',
  'Vercel-CDN-Cache-Control': 'no-store',
}

export function backendOrigin(value: string | undefined): string {
  if (!value) throw new Error('BACKEND_ORIGIN is required for Vercel deployment')
  const url = new URL(value)
  if (url.protocol !== 'https:' || url.username || url.password ||
      url.pathname !== '/' || url.search || url.hash) {
    throw new Error('BACKEND_ORIGIN must be an HTTPS origin without credentials or a path')
  }
  return url.origin
}

export function vercelConfiguration(env: Record<string, string | undefined>): VercelConfig {
  if (env.VITE_API_BASE_URL?.trim()) {
    throw new Error('Leave VITE_API_BASE_URL unset on Vercel: sessions and CSRF require the same-origin proxy')
  }
  const origin = backendOrigin(env.BACKEND_ORIGIN)
  return {
    framework: 'vite',
    buildCommand: 'npm run build',
    outputDirectory: 'dist',
    rewrites: [
      { source: '/api/:path*', destination: origin + '/api/:path*' },
      { source: '/actuator/health', destination: origin + '/actuator/health' },
      { source: '/(.*)', destination: '/index.html' },
    ],
    headers: [
      ...['/api/:path*', '/actuator/health', '/assets/ai/:path*'].map((source) => ({
        source,
        headers: Object.entries(PRIVATE_HEADERS).map(([key, value]) => ({ key, value })),
      })),
      { source: '/index.html', headers: [{ key: 'Cache-Control', value: 'no-cache' }] },
    ],
  }
}

/** Normalize encoded separators/dots before checking the same asset boundary as nginx. */
function assetPath(path: string): string {
  const decoded = decodeURIComponent(path)
  if (decoded.includes('%')) throw new Error('Ambiguous encoded path')
  return new URL('https://assets.invalid' + decoded.replace(/\\/g, '/').replace(/\/{2,}/g, '/')).pathname
}

/** Spring is the authority; never infer a role from browser state or the presence of a cookie. */
export async function authorizeAiAsset(
  request: Request,
  origin: string | undefined,
  fetcher: typeof fetch = fetch,
): Promise<'public' | 'admin' | Response> {
  let path: string
  try {
    path = assetPath(new URL(request.url).pathname)
  } catch {
    return new Response(null, { status: 400, headers: PRIVATE_HEADERS })
  }
  if (!/^\/assets\/ai(?:\/|$)/i.test(path)) return 'public'
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response(null, { status: 405, headers: { ...PRIVATE_HEADERS, Allow: 'GET, HEAD' } })
  }
  try {
    const response = await fetcher(backendOrigin(origin) + '/api/ai/access', {
      headers: { Cookie: request.headers.get('cookie') ?? '' },
      redirect: 'manual',
      cache: 'no-store',
      signal: AbortSignal.timeout(10_000),
    })
    if (response.status === 204) return 'admin'
    const status = response.status === 401 || response.status === 403 ? response.status : 503
    return new Response(null, { status, headers: PRIVATE_HEADERS })
  } catch {
    return new Response(null, { status: 503, headers: PRIVATE_HEADERS })
  }
}
