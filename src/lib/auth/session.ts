import 'server-only'

import type { XanoResult } from '../xano/client'
import { fetchCurrentUser } from '../xano/auth'
import { parseCurrentUser, type CurrentUser } from './current-user'
import { readSessionCookie, type SessionCookieStore } from './cookies'

/**
 * Session verification (server only).
 *
 * A browser session is authenticated only when Xano accepts the token from
 * the cookie and answers GET /auth/me with a body that satisfies the verified
 * contract (role from the known set, is_active === true). Possessing a cookie
 * means nothing on its own, and Xano is the authority on eligibility: it
 * refuses ineligible accounts on every request.
 *
 * The current-user call defaults to the verified operation and stays
 * injectable for tests.
 *
 * This function never modifies cookies. A caller that receives 'rejected'
 * clears the cookie from a Route Handler (never from a GET, never from a
 * Server Component).
 */

/** Calls Xano's current-user endpoint with the given token. */
export type CurrentUserFetcher = (token: string) => Promise<XanoResult<unknown>>

export type SessionState =
  /** No session cookie, or a malformed one. */
  | { status: 'anonymous' }
  /** Xano refused the token (401/403), or reported the account as not active. */
  | { status: 'rejected' }
  /** Xano could not be reached, or answered outside the verified contract; nothing is known. */
  | { status: 'unavailable' }
  /** Xano accepted the token and the response satisfies the contract with is_active true. */
  | { status: 'authenticated'; user: CurrentUser }

const defaultFetcher: CurrentUserFetcher = (token) => fetchCurrentUser(token)

export async function verifySession(
  fetchUser: CurrentUserFetcher = defaultFetcher,
  store?: SessionCookieStore,
): Promise<SessionState> {
  const token = await readSessionCookie(store)
  if (token === null) return { status: 'anonymous' }

  const result = await fetchUser(token)
  if (result.ok) {
    const user = parseCurrentUser(result.data)
    if (user === null) return { status: 'unavailable' }
    if (user.is_active !== true) return { status: 'rejected' }
    return { status: 'authenticated', user }
  }

  const { error } = result
  if (error.kind === 'http' && (error.status === 401 || error.status === 403)) {
    return { status: 'rejected' }
  }
  return { status: 'unavailable' }
}
