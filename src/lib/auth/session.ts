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
 * with response validation. Until then `user` is typed as unknown.
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
  /** Xano accepted the token. `user` is Xano's current-user response. */
  | { status: 'authenticated'; user: unknown }

export async function verifySession(
  fetchCurrentUser: CurrentUserFetcher,
  store?: SessionCookieStore,
): Promise<SessionState> {
  const token = await readSessionCookie(store)
  if (token === null) return { status: 'anonymous' }

  const result = await fetchCurrentUser(token)
  if (result.ok) return { status: 'authenticated', user: result.data }

  const { error } = result
  if (error.kind === 'http' && (error.status === 401 || error.status === 403)) {
    return { status: 'rejected' }
  }
  return { status: 'unavailable' }
}
