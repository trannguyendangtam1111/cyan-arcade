/**
 * Thin fetch wrapper shared by every API module.
 *
 * The backend reports every failure as RFC 9457 problem details (see API.md), so callers only
 * ever deal with one error type: {@link ApiError}.
 */

export interface FieldError {
  field: string
  message: string
}

interface ProblemDetail {
  status?: number
  title?: string
  detail?: string
  code?: string
  errors?: FieldError[]
}

export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly fieldErrors: FieldError[]

  constructor(status: number, code: string, message: string, fieldErrors: FieldError[] = []) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.fieldErrors = fieldErrors
  }

  /** True for failures that retrying will not fix (validation, auth, not found, ...). */
  get isClientError(): boolean {
    return this.status >= 400 && this.status < 500
  }
}

export const NETWORK_ERROR = 'NETWORK_ERROR'

/**
 * Empty by default: the app calls its own origin and the dev server / nginx proxies `/api`.
 * Set `VITE_API_BASE_URL` (e.g. `http://localhost:8080`) to call the backend directly via CORS.
 */
const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '')

type JsonBody = Record<string, unknown> | unknown[]

export interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: JsonBody
}

/** Send the session cookie to our own origin, or to the configured backend when calling it directly. */
const CREDENTIALS: RequestCredentials = API_BASE_URL ? 'include' : 'same-origin'

const CSRF_COOKIE = 'XSRF-TOKEN'
const CSRF_HEADER = 'X-XSRF-TOKEN'
/** A harmless public endpoint; asking it for anything makes the server hand out a CSRF cookie. */
const CSRF_BOOTSTRAP_PATH = '/api/auth/session'

function readCsrfCookie(): string | null {
  const entry = document.cookie.split('; ').find((cookie) => cookie.startsWith(`${CSRF_COOKIE}=`))
  return entry ? decodeURIComponent(entry.slice(CSRF_COOKIE.length + 1)) : null
}

/**
 * The CSRF token for a request that changes something.
 *
 * The server puts the token in a cookie with every response and expects it back in a header.
 * Only this site's pages can read that cookie, which is what stops other sites from making
 * requests on a signed-in player's behalf. The cookie is read fresh each time because the server
 * replaces the token at sign-in and sign-out.
 */
async function csrfToken(): Promise<string | null> {
  const token = readCsrfCookie()
  if (token) return token
  // Nothing has been loaded from the API yet in this browser: fetch the cookie first.
  await fetch(API_BASE_URL + CSRF_BOOTSTRAP_PATH, { credentials: CREDENTIALS }).catch(() => undefined)
  return readCsrfCookie()
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { body, headers, ...rest } = options
  const changesSomething = !SAFE_METHODS.has((rest.method ?? 'GET').toUpperCase())

  let response: Response
  try {
    const token = changesSomething ? await csrfToken() : null
    response = await fetch(API_BASE_URL + path, {
      credentials: CREDENTIALS,
      ...rest,
      headers: {
        Accept: 'application/json, application/problem+json',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { [CSRF_HEADER]: token } : {}),
        ...headers,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === 'AbortError') throw cause
    throw new ApiError(0, NETWORK_ERROR, 'Could not reach the Cyan Arcade server.')
  }

  if (!response.ok) {
    throw await toApiError(response)
  }

  if (response.status === 204 || response.headers.get('Content-Length') === '0') {
    return undefined as T
  }
  return (await response.json()) as T
}

async function toApiError(response: Response): Promise<ApiError> {
  let problem: ProblemDetail = {}
  try {
    problem = (await response.json()) as ProblemDetail
  } catch {
    // Non-JSON error (e.g. a proxy's HTML 502 page). Fall back to the HTTP status.
  }
  return new ApiError(
    response.status,
    problem.code ?? `HTTP_${response.status}`,
    problem.detail ?? problem.title ?? response.statusText ?? 'Request failed',
    problem.errors ?? [],
  )
}
