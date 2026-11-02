import { next } from '@vercel/functions'
import { authorizeAiAsset, PRIVATE_HEADERS } from './deployment.js'

// Run before every filesystem/cache lookup, including encoded asset paths.
// Only AI asset requests call Spring; ordinary assets and API rewrites pass through.
export const config = { matcher: '/(.*)' }

export default async function middleware(request: Request) {
  const result = await authorizeAiAsset(request, process.env.BACKEND_ORIGIN)
  if (result instanceof Response) return result
  return next({ headers: result === 'admin' ? PRIVATE_HEADERS : undefined })
}
