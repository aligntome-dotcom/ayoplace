import 'server-only'

import type { XanoResult } from '../xano/client'
import { readSessionCookie, type SessionCookieStore } from './cookies'

/**
 * Session verification foundation (server only).
 *
 * A browser session is authenticated only when Xano accepts the token from
 * the cookie and returns its current-user response. Possessing a cookie means
 * nothing on its own, and Xano is the authority on whether the account is
 * still eligible (active status is enforced there on every request).
 *
 * The call to the current-user endpoint is injected as `fetchCurrentUser` so
 * that this module does not hard-code the endpoint or its response shape;
 * the verified binding is added in the integration step that follows, along
 * with field-level validation against the verified contract. Until then the
 * only shape requirement is that a successful answer is a non-empty plain
 * object: a 2xx with an empty, null, array or primitive body is not an
 * authenticated session, it is an unexpected answer and is reported as
 * 'unavailable'.
 * `user` stays typed as unknown so callers must validate before use.
 *
 * This function never modifies cookies. A caller that receives 'rejected'
 * should clear the cookie from a Route Handler or Server Action.
 */

/** Calls Xano's current-user endpoint with the given token. */
export type CurrentUserFetcher = (token: string) => Promise<XanoResult<unknown>>

export type SessionState =
  /** No session cookie, or a malformed one. */
  | { status: 'anonymous' }
  /** Xano refused the token (401/403): expired, invalid, or account no longer eligible. */
  | { status: 'rejected' }
  /** Xano could not be reached or answered unexpectedly; nothing is known. */
  | { status: 'unavailable' }
  /** Xano accepted the token and answered with an object. `user` is that current-user response. */
  | { status: 'authenticated'; user: Record<string, unknown> }

// A non-empty plain object. Which fields it must carry is decided when the
// verified current-user contract is bound; nothing is assumed here.
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && Object.keys(value).length > 0
}

export async function verifySession(
  fetchCurrentUser: CurrentUserFetcher,
  store?: SessionCookieStore,
): Promise<SessionState> {
  const token = await readSessionCookie(store)
  if (token === null) return { status: 'anonymous' }

  const result = await fetchCurrentUser(token)
  if (result.ok) {
    // A 2xx alone proves nothing; the answer must at least be an object.
    return isPlainObject(result.data) ? { status: 'authenticated', user: result.data } : { status: 'unavailable' }
  }

  const { error } = result
  if (error.kind === 'http' && (error.status === 401 || error.status === 403)) {
    return { status: 'rejected' }
  }
  return { status: 'unavailable' }
}
