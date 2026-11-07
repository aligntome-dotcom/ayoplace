import 'server-only'

import { getXanoBaseUrl, type EnvSource } from '../server/env'
import { isWellFormedToken } from '../auth/token'
import { XANO_API_GROUPS, type XanoApiGroup } from './groups'

export { isWellFormedToken }

/**
 * Server-only HTTP client for the Xano backend.
 *
 * - Builds every URL from the validated XANO_BASE_URL and a verified API group,
 *   and checks after parsing that the URL is still inside that group.
 * - Sends and receives JSON; attaches a Bearer token when one is supplied.
 * - Never retries, never follows redirects (a redirect would carry the
 *   Authorization header elsewhere), never logs.
 * - One timeout covers the whole exchange, headers and body.
 * - Returns a discriminated result instead of throwing for backend responses,
 *   and throws only for programming or configuration errors.
 *
 * Errors come in two layers: XanoError carries the internal detail (HTTP
 * status, backend message, cause) for server-side decisions, and
 * XanoError.toSafe() produces the only shape that may reach a browser. The
 * internal fields are non-enumerable and toJSON() returns the safe shape, so
 * serialising an error, or a result that contains one, cannot leak them.
 */

export type XanoMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

export type XanoErrorKind = 'http' | 'network' | 'timeout' | 'invalid_response'

export type SafeErrorCode =
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'bad_request'
  | 'conflict'
  | 'backend_unavailable'
  | 'backend_error'

/** The only error shape that may be serialised to the browser. */
export interface SafeError {
  code: SafeErrorCode
  message: string
}

const SAFE_MESSAGES: Record<SafeErrorCode, string> = {
  unauthorized: 'Your session is not valid. Please sign in again.',
  forbidden: 'This action is not allowed.',
  not_found: 'The requested item could not be found.',
  bad_request: 'The request could not be processed.',
  conflict: 'The request conflicts with existing data.',
  backend_unavailable: 'The service is temporarily unavailable. Please try again shortly.',
  backend_error: 'Something went wrong on our side. Please try again shortly.',
}

export class XanoError extends Error {
  // Declared only: the values are installed as non-enumerable properties in
  // the constructor so that JSON.stringify and object spread never see them.
  declare readonly kind: XanoErrorKind
  /** HTTP status for kind 'http'. Server-side use only. */
  declare readonly status?: number
  /**
   * The backend's own `message` field, when the response carried one.
   * Server-side use only (for example to distinguish backend outcomes);
   * it is never included in message, toString(), toJSON() or toSafe().
   */
  declare readonly backendMessage?: string

  constructor(
    kind: XanoErrorKind,
    message: string,
    options: { status?: number; backendMessage?: string; cause?: unknown } = {},
  ) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause })
    const hidden = (value: unknown) => ({ value, enumerable: false, writable: false, configurable: false })
    Object.defineProperty(this, 'name', hidden('XanoError'))
    Object.defineProperty(this, 'kind', hidden(kind))
    if (options.status !== undefined) Object.defineProperty(this, 'status', hidden(options.status))
    if (options.backendMessage !== undefined) {
      Object.defineProperty(this, 'backendMessage', hidden(options.backendMessage))
    }
  }

  get safeCode(): SafeErrorCode {
    switch (this.kind) {
      case 'network':
      case 'timeout':
        return 'backend_unavailable'
      case 'invalid_response':
        return 'backend_error'
      case 'http': {
        const s = this.status ?? 0
        if (s === 401) return 'unauthorized'
        if (s === 403) return 'forbidden'
        if (s === 404) return 'not_found'
        if (s === 409) return 'conflict'
        if (s >= 400 && s < 500) return 'bad_request'
        return 'backend_error'
      }
    }
  }

  /** Generic, browser-safe representation. Contains no backend text. */
  toSafe(): SafeError {
    const code = this.safeCode
    return { code, message: SAFE_MESSAGES[code] }
  }

  /** JSON.stringify always produces the safe shape, never the internals. */
  toJSON(): SafeError {
    return this.toSafe()
  }
}

export type XanoResult<T> = { ok: true; status: number; data: T } | { ok: false; error: XanoError }

export interface XanoRequest {
  group: XanoApiGroup
  /** Path within the group, starting with '/', e.g. '/auth/login'. */
  path: string
  method?: XanoMethod
  /** JSON body. Not permitted on GET. */
  body?: unknown
  /** Query parameters; undefined values are omitted. */
  query?: Record<string, string | number | boolean | undefined>
  /** Bearer token for authenticated endpoints. */
  token?: string
  /** Timeout in milliseconds for the whole exchange, headers and body (default 10 000). */
  timeoutMs?: number
}

export interface XanoClientOptions {
  /** fetch implementation (injectable for tests). */
  fetch?: typeof fetch
  /** Environment source (injectable for tests). */
  env?: EnvSource
}

export const DEFAULT_TIMEOUT_MS = 10_000

// Endpoint paths are code constants. Allow exactly the characters they use:
// '/'-separated segments of letters, digits, '.', '_', '~' and '-'. No '%' at
// all, so no percent-encoded dots, separators, controls or double encodings
// can reach the URL parser or a downstream decoder.
const ALLOWED_PATH = /^(\/[A-Za-z0-9._~-]+)+$/
// Percent-encoded '.', '/' and '\' have no place in an endpoint path: the URL
// parser would turn encoded dots into traversal segments, and encoded
// separators only exist to confuse routers. (Already excluded by ALLOWED_PATH;
// kept as a named check so the intent survives any later relaxation.)
const ENCODED_SEPARATOR = /%(2e|2f|5c)/i
// Query, fragment, whitespace, C0 controls (including NUL) and DEL.
const FORBIDDEN_PATH_CHARS = /[?#\s\u0000-\u001f\u007f]/

/**
 * Builds the absolute request URL from the base origin, group and path.
 *
 * Input checks reject the obvious forms, then the parsed URL is checked again:
 * it must still be on the base origin and its pathname must still start with
 * the group path. That post-condition is what guarantees the request cannot
 * leave the group, whatever the parser normalised.
 */
export function buildXanoUrl(
  base: URL,
  group: XanoApiGroup,
  path: string,
  query?: XanoRequest['query'],
): URL {
  if (typeof path !== 'string' || !path.startsWith('/')) {
    throw new Error('Xano request path must start with "/"')
  }
  if (path.includes('..') || path.includes('://') || path.startsWith('//') || path.includes('\\')) {
    throw new Error('Xano request path must be a plain path within the API group')
  }
  if (FORBIDDEN_PATH_CHARS.test(path)) {
    throw new Error('Xano request path must not contain a query, fragment, whitespace or control characters')
  }
  if (ENCODED_SEPARATOR.test(path)) {
    throw new Error('Xano request path must not contain percent-encoded dots or separators')
  }
  if (!ALLOWED_PATH.test(path)) {
    throw new Error('Xano request path may contain only /-separated segments of [A-Za-z0-9._~-]')
  }
  if (!Object.hasOwn(XANO_API_GROUPS, group)) throw new Error('Unknown Xano API group')
  const groupPath = XANO_API_GROUPS[group]

  const url = new URL(`${groupPath}${path}`, base.origin)

  // Post-condition on the normalised URL: same origin, still inside the group.
  if (url.origin !== base.origin || url.pathname !== `${groupPath}${path}` || !url.pathname.startsWith(`${groupPath}/`)) {
    throw new Error('Xano request path escaped the API group after URL normalisation')
  }

  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) url.searchParams.set(key, String(value))
    }
  }
  return url
}

/** Builds request headers; the Authorization header is added only when a token is given. */
export function buildXanoHeaders(options: { token?: string; hasBody: boolean }): Record<string, string> {
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (options.hasBody) headers['Content-Type'] = 'application/json'
  if (options.token !== undefined) {
    if (!isWellFormedToken(options.token)) {
      // Deliberately does not include the offending value.
      throw new Error('Bearer token is malformed')
    }
    headers.Authorization = `Bearer ${options.token}`
  }
  return headers
}

async function readBody(response: Response): Promise<{ json: unknown; parsed: boolean }> {
  const text = await response.text()
  if (text.trim() === '') return { json: null, parsed: true }
  try {
    return { json: JSON.parse(text) as unknown, parsed: true }
  } catch {
    return { json: null, parsed: false }
  }
}

function backendMessageOf(json: unknown): string | undefined {
  if (json && typeof json === 'object' && 'message' in json) {
    const m = (json as { message: unknown }).message
    if (typeof m === 'string') return m
  }
  return undefined
}

function transportFailure(aborted: boolean, timeoutMs: number, cause: unknown): XanoError {
  if (aborted) return new XanoError('timeout', `Xano request timed out after ${timeoutMs} ms`)
  return new XanoError('network', 'Xano could not be reached', { cause })
}

/**
 * Performs one request against Xano. Resolves with a result for any backend
 * response or transport failure; rejects only for programming errors
 * (bad path, malformed token, body on GET) and configuration errors.
 */
export async function xanoFetch<T = unknown>(
  request: XanoRequest,
  options: XanoClientOptions = {},
): Promise<XanoResult<T>> {
  const method: XanoMethod = request.method ?? 'GET'
  if (method === 'GET' && request.body !== undefined) {
    throw new Error('GET requests cannot carry a body')
  }

  const base = getXanoBaseUrl(options.env)
  const url = buildXanoUrl(base, request.group, request.path, request.query)
  const hasBody = request.body !== undefined
  const headers = buildXanoHeaders({ token: request.token, hasBody })
  const doFetch = options.fetch ?? fetch

  const controller = new AbortController()
  const timeoutMs = request.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    let response: Response
    try {
      response = await doFetch(url, {
        method,
        headers,
        body: hasBody ? JSON.stringify(request.body) : undefined,
        signal: controller.signal,
        redirect: 'manual',
        cache: 'no-store',
      })
    } catch (cause) {
      return { ok: false, error: transportFailure(controller.signal.aborted, timeoutMs, cause) }
    }

    // The same deadline covers the body: an abort here is still a timeout.
    let body: { json: unknown; parsed: boolean }
    try {
      body = await readBody(response)
    } catch (cause) {
      return { ok: false, error: transportFailure(controller.signal.aborted, timeoutMs, cause) }
    }

    if (response.status >= 200 && response.status < 300) {
      if (!body.parsed) {
        return {
          ok: false,
          error: new XanoError('invalid_response', `Xano returned a non-JSON body with HTTP ${response.status}`),
        }
      }
      return { ok: true, status: response.status, data: body.json as T }
    }

    return {
      ok: false,
      error: new XanoError('http', `Xano responded with HTTP ${response.status}`, {
        status: response.status,
        backendMessage: backendMessageOf(body.json),
      }),
    }
  } finally {
    clearTimeout(timer)
  }
}
