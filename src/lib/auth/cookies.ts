import 'server-only'

import type { EnvSource } from '../server/env'

/**
 * Session cookie utilities (server only).
 *
 * The cookie carries the Xano auth token so that server code can call Xano on
 * the user's behalf. It is HTTP-only, so browser JavaScript can never read it,
 * and it is never echoed into a response body.
 *
 * Clearing the cookie ends the browser session only. Xano has no confirmed
 * token-revocation endpoint, so the token itself remains valid at Xano until
 * it expires (24 hours after issue) or the account is made ineligible, which
 * Xano re-checks on every authenticated request.
 *
 * Cookies can be modified only from a Route Handler or Server Action; reading
 * works in any server context.
 */

export const SESSION_COOKIE_NAME = 'ayo_session'

/** Matches the confirmed Xano token lifetime of 24 hours. */
export const SESSION_MAX_AGE_SECONDS = 24 * 60 * 60

const TOKEN_PATTERN = /^[A-Za-z0-9._~+/=-]+$/
const TOKEN_MAX_LENGTH = 4000 // keeps the whole Set-Cookie under the 4 KiB browser limit

export interface SessionCookieAttributes {
  httpOnly: true
  secure: boolean
  sameSite: 'lax'
  path: '/'
  maxAge: number
}

/** Minimal cookie store, satisfied by `await cookies()` from next/headers. */
export interface SessionCookieStore {
  get(name: string): { value: string } | undefined
  set(name: string, value: string, options?: Partial<SessionCookieAttributes> & { expires?: Date }): unknown
}

export function sessionCookieAttributes(env: EnvSource = process.env): SessionCookieAttributes {
  return {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_MAX_AGE_SECONDS,
  }
}

export function isValidSessionToken(value: unknown): value is string {
  return (
    typeof value === 'string' && value.length > 0 && value.length <= TOKEN_MAX_LENGTH && TOKEN_PATTERN.test(value)
  )
}

// next/headers is loaded lazily so this module can be exercised outside the
// Next.js runtime (unit tests inject a store); inside Next it is the request
// cookie store, which is read-only outside Route Handlers and Server Actions.
async function defaultStore(): Promise<SessionCookieStore> {
  const { cookies } = await import('next/headers')
  return cookies()
}

/** Writes the session cookie. Route Handlers and Server Actions only. */
export async function setSessionCookie(token: string, store?: SessionCookieStore): Promise<void> {
  if (!isValidSessionToken(token)) {
    // The value is deliberately not included in the message.
    throw new Error('Refusing to set a malformed session token')
  }
  const s = store ?? (await defaultStore())
  s.set(SESSION_COOKIE_NAME, token, sessionCookieAttributes())
}

/** Returns the raw cookie value, or null when absent or malformed. Presence proves nothing about validity. */
export async function readSessionCookie(store?: SessionCookieStore): Promise<string | null> {
  const s = store ?? (await defaultStore())
  const value = s.get(SESSION_COOKIE_NAME)?.value
  return isValidSessionToken(value) ? value : null
}

/** Expires the cookie in the browser. Does not revoke the token at Xano. */
export async function clearSessionCookie(store?: SessionCookieStore): Promise<void> {
  const s = store ?? (await defaultStore())
  s.set(SESSION_COOKIE_NAME, '', { ...sessionCookieAttributes(), maxAge: 0, expires: new Date(0) })
}

/** True when a cookie with the session name is present (whatever its value). */
export async function hasSessionCookie(store?: SessionCookieStore): Promise<boolean> {
  const s = store ?? (await defaultStore())
  return s.get(SESSION_COOKIE_NAME) !== undefined
}
