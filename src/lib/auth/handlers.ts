import 'server-only'

import { ConfigError, getAppOrigin, type EnvSource } from '../server/env'
import type { XanoClientOptions, XanoError, XanoResult } from '../xano/client'
import { fetchCurrentUser, login, parseAuthResponse, signupCustomer } from '../xano/auth'
import { clearSessionCookie, setSessionCookie, type SessionCookieStore } from './cookies'
import { parseCurrentUser, type CurrentUser } from './current-user'
import { checkRequestOrigin } from './origin'
import { verifySession } from './session'

/**
 * Authentication Route Handler logic (server only).
 *
 * The exported handle* functions are what the files under src/app/api/auth
 * call. Dependencies (environment, fetch, cookie store) are injectable so the
 * complete flows are unit-tested against a mocked Xano; see
 * tests/unit/handlers.spec.ts. Live Xano behaviour is not covered by tests.
 *
 * Order inside every state-changing handler, per docs/auth-handler-requirements.md:
 *   1. Origin check against APP_ORIGIN (trusted configuration).
 *   2. Only then read and validate the body.
 *   3. Only then call Xano.
 *   4. Set or clear the cookie last, and only after every check passed.
 * GET handlers never write cookies.
 */

export interface HandlerDeps {
  env?: EnvSource
  fetch?: typeof fetch
  store?: SessionCookieStore
}

export type AuthErrorCode =
  | 'invalid_origin'
  | 'invalid_request'
  | 'request_too_large'
  | 'invalid_credentials'
  | 'account_inactive'
  | 'email_taken'
  | 'backend_unavailable'
  | 'backend_error'

const MESSAGES: Record<AuthErrorCode, string> = {
  invalid_origin: 'This request was not accepted.',
  invalid_request: 'Please check the details you entered.',
  request_too_large: 'The request was too large.',
  invalid_credentials: 'Sign-in failed. Check your email and password.',
  account_inactive: 'This account is not active. Please contact us.',
  email_taken: 'An account with this email already exists. Try signing in instead.',
  backend_unavailable: 'The service is temporarily unavailable. Please try again shortly.',
  backend_error: 'Something went wrong on our side. Please try again shortly.',
}

/** What a browser may learn about the signed-in user. Never the token. */
export interface PublicUser {
  id?: number
  name?: string
  email?: string
  role: CurrentUser['role']
}

export function publicUser(user: CurrentUser): PublicUser {
  const out: PublicUser = { role: user.role }
  if (user.id !== undefined) out.id = user.id
  if (user.name !== undefined) out.name = user.name
  if (user.email !== undefined) out.email = user.email
  return out
}

const NO_STORE = { 'Cache-Control': 'no-store' }

function json(status: number, body: unknown): Response {
  return Response.json(body, { status, headers: NO_STORE })
}

export function fail(status: number, code: AuthErrorCode): Response {
  return json(status, { ok: false, error: { code, message: MESSAGES[code] } })
}

// Frontend policy (not a backend contract): bounds that keep inputs sane.
const EMAIL_MAX = 254
const PASSWORD_MIN = 8
const PASSWORD_MAX = 256
const NAME_MAX = 120
/** Hard cap on a request body, in bytes, enforced while the body streams in. */
export const BODY_MAX_BYTES = 16 * 1024

/** Keys a signup body must never carry; the backend decides all of them. */
export const FORBIDDEN_SIGNUP_KEYS = ['role', 'is_active', 'status', 'experience', 'id', 'user_id'] as const

function originGate(request: Request, env: EnvSource): Response | null {
  let appOrigin: string
  try {
    appOrigin = getAppOrigin(env)
  } catch {
    // Missing or malformed APP_ORIGIN fails closed.
    return fail(403, 'invalid_origin')
  }
  const check = checkRequestOrigin(request.headers, appOrigin)
  return check.ok ? null : fail(403, 'invalid_origin')
}

export type BodyRead =
  | { ok: true; value: Record<string, unknown> }
  | { ok: false; reason: 'too_large' | 'invalid' }

/**
 * Reads the request body as bytes with a hard cap, then parses it as a JSON
 * object. The cap is enforced while streaming: once more than
 * BODY_MAX_BYTES have arrived the reader is cancelled and nothing further
 * is buffered. Content-Length is used only as an early exit; it is never
 * trusted to be present or truthful. Invalid UTF-8 and malformed or
 * non-object JSON are rejected.
 */
export async function readBoundedJsonObject(request: Request, maxBytes: number = BODY_MAX_BYTES): Promise<BodyRead> {
  const type = request.headers.get('content-type') ?? ''
  if (!/^application\/json(\s*;|$)/i.test(type)) return { ok: false, reason: 'invalid' }

  const declared = request.headers.get('content-length')
  if (declared !== null && /^\d+$/.test(declared) && Number(declared) > maxBytes) return { ok: false, reason: 'too_large' }

  if (request.body === null) return { ok: false, reason: 'invalid' }
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let received = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      if (!value) continue
      received += value.byteLength
      if (received > maxBytes) {
        await reader.cancel().catch(() => undefined)
        return { ok: false, reason: 'too_large' }
      }
      chunks.push(value)
    }
  } catch {
    // Aborted or errored stream.
    return { ok: false, reason: 'invalid' }
  } finally {
    reader.releaseLock()
  }

  const bytes = new Uint8Array(received)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }

  let text: string
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return { ok: false, reason: 'invalid' }
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return { ok: false, reason: 'invalid' }
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return { ok: false, reason: 'invalid' }
  return { ok: true, value: parsed as Record<string, unknown> }
}

/** Reads the body for a handler, or returns the response that rejects it. */
async function readJsonObject(request: Request): Promise<{ body: Record<string, unknown> } | { response: Response }> {
  const read = await readBoundedJsonObject(request)
  if (read.ok) return { body: read.value }
  return { response: read.reason === 'too_large' ? fail(413, 'request_too_large') : fail(400, 'invalid_request') }
}

export function normaliseEmail(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const email = value.trim()
  if (email.length === 0 || email.length > EMAIL_MAX) return null
  if (/[\s\u0000-\u001f\u007f]/.test(email)) return null
  const at = email.indexOf('@')
  if (at < 1 || at === email.length - 1 || at !== email.lastIndexOf('@')) return null
  return email
}

export function validPassword(value: unknown): value is string {
  return typeof value === 'string' && value.length >= PASSWORD_MIN && value.length <= PASSWORD_MAX && !/[\u0000-\u001f\u007f]/.test(value)
}

export function normaliseName(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const name = value.trim().replace(/\s+/g, ' ')
  if (name.length === 0 || name.length > NAME_MAX) return null
  if (/[\u0000-\u001f\u007f]/.test(name)) return null
  return name
}

function isBackendMessage(error: XanoError, prefix: string): boolean {
  return error.kind === 'http' && typeof error.backendMessage === 'string' && error.backendMessage.startsWith(prefix)
}

/** Maps a transport/backend failure that is not a credential outcome. */
function backendFailure(error: XanoError): Response {
  if (error.kind === 'network' || error.kind === 'timeout') return fail(503, 'backend_unavailable')
  return fail(502, 'backend_error')
}

/**
 * Verifies a freshly issued token against GET /auth/me and, only if the
 * account is an active customer, writes the session cookie.
 */
async function establishCustomerSession(
  token: string,
  opts: XanoClientOptions,
  store: SessionCookieStore | undefined,
): Promise<{ ok: true; user: CurrentUser } | { ok: false; response: Response }> {
  const me = await fetchCurrentUser(token, opts)
  if (!me.ok) {
    const { error } = me
    if (error.kind === 'http' && error.status === 401) return { ok: false, response: fail(401, 'invalid_credentials') }
    if (error.kind === 'http' && error.status === 403) return { ok: false, response: fail(403, 'account_inactive') }
    return { ok: false, response: backendFailure(error) }
  }
  const user = parseCurrentUser(me.data)
  if (user === null) return { ok: false, response: fail(502, 'backend_error') }
  if (user.role !== 'customer') {
    // The public door is for customers only. Generic answer, no cookie.
    return { ok: false, response: fail(401, 'invalid_credentials') }
  }
  if (user.is_active !== true) return { ok: false, response: fail(403, 'account_inactive') }

  await setSessionCookie(token, store)
  return { ok: true, user }
}

function guarded(run: () => Promise<Response>): Promise<Response> {
  return run().catch((e: unknown) => {
    // Configuration and unexpected errors never reach the browser in detail.
    if (e instanceof ConfigError) return fail(503, 'backend_unavailable')
    return fail(500, 'backend_error')
  })
}

/** POST /api/auth/login — customer sign-in. */
export function handleLogin(request: Request, deps: HandlerDeps = {}): Promise<Response> {
  return guarded(async () => {
    const env = deps.env ?? process.env
    const denied = originGate(request, env)
    if (denied) return denied

    const read = await readJsonObject(request)
    if ('response' in read) return read.response
    const { body } = read
    const email = normaliseEmail(body.email)
    const password = body.password
    if (email === null || !validPassword(password)) return fail(400, 'invalid_request')

    const opts: XanoClientOptions = { env, fetch: deps.fetch }
    const result = await login({ email, password }, opts)
    if (!result.ok) {
      const { error } = result
      // The verified contract: 403 for bad credentials and for deactivated
      // accounts (distinguished by message). Any other status is not a
      // credential outcome and is reported as a backend failure.
      if (error.kind === 'http' && error.status === 403) {
        if (isBackendMessage(error, 'This account has been deactivated')) return fail(403, 'account_inactive')
        return fail(401, 'invalid_credentials')
      }
      return backendFailure(error)
    }
    const auth = parseAuthResponse(result.data)
    if (auth === null) return fail(502, 'backend_error')

    const session = await establishCustomerSession(auth.authToken, opts, deps.store)
    if (!session.ok) return session.response
    return json(200, { ok: true, user: publicUser(session.user) })
  })
}

/** POST /api/auth/signup — customer registration only. */
export function handleSignup(request: Request, deps: HandlerDeps = {}): Promise<Response> {
  return guarded(async () => {
    const env = deps.env ?? process.env
    const denied = originGate(request, env)
    if (denied) return denied

    const read = await readJsonObject(request)
    if ('response' in read) return read.response
    const { body } = read
    // No client may choose a role or any account attribute.
    if (FORBIDDEN_SIGNUP_KEYS.some((key) => key in body)) return fail(400, 'invalid_request')
    const name = normaliseName(body.name)
    const email = normaliseEmail(body.email)
    const password = body.password
    if (name === null || email === null || !validPassword(password)) return fail(400, 'invalid_request')

    const opts: XanoClientOptions = { env, fetch: deps.fetch }
    const result = await signupCustomer({ name, email, password }, opts)
    if (!result.ok) {
      const { error } = result
      // The verified contract: 403 for a duplicate email, 400 for a missing
      // email. Anything else is a backend failure, not a validation outcome.
      if (error.kind === 'http' && error.status === 403 && isBackendMessage(error, 'An account with this email already exists')) {
        return fail(409, 'email_taken')
      }
      if (error.kind === 'http' && error.status === 400) return fail(400, 'invalid_request')
      return backendFailure(error)
    }
    const auth = parseAuthResponse(result.data)
    if (auth === null) return fail(502, 'backend_error')

    const session = await establishCustomerSession(auth.authToken, opts, deps.store)
    if (!session.ok) return session.response
    return json(201, { ok: true, user: publicUser(session.user) })
  })
}

/**
 * POST /api/auth/logout — ends the browser session by clearing the cookie.
 * The Xano token itself stays valid at Xano until it expires (24 h) or the
 * account becomes ineligible; there is no revocation endpoint to call.
 */
export function handleLogout(request: Request, deps: HandlerDeps = {}): Promise<Response> {
  return guarded(async () => {
    const env = deps.env ?? process.env
    const denied = originGate(request, env)
    if (denied) return denied
    await clearSessionCookie(deps.store)
    return json(200, { ok: true })
  })
}

/**
 * GET /api/auth/session — reports the verified session state. Never writes
 * cookies: a rejected session is cleared by the next POST handler in the flow.
 */
export function handleSession(deps: HandlerDeps = {}): Promise<Response> {
  return guarded(async () => {
    const env = deps.env ?? process.env
    const opts: XanoClientOptions = { env, fetch: deps.fetch }
    let state: Awaited<ReturnType<typeof verifySession>>
    try {
      state = await verifySession((token) => fetchCurrentUser(token, opts), deps.store)
    } catch (e) {
      if (!(e instanceof ConfigError)) throw e
      state = { status: 'unavailable' }
    }
    switch (state.status) {
      case 'authenticated':
        return json(200, { authenticated: true, user: publicUser(state.user) })
      case 'anonymous':
        return json(200, { authenticated: false })
      case 'rejected':
        return json(401, { authenticated: false, reason: 'rejected' })
      case 'unavailable':
        return json(503, { authenticated: false, reason: 'unavailable' })
    }
  })
}

export type { XanoResult }
