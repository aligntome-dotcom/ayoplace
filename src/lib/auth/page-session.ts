import 'server-only'

import { ConfigError } from '../server/env'
import { verifySession, type SessionState } from './session'

/**
 * Session state for Server Components. Reads the cookie and asks Xano; never
 * writes cookies. A missing backend configuration is reported as
 * 'unavailable' so a page can render a calm notice instead of failing.
 */
/**
 * True only when this server render verified the cookie with Xano and Xano
 * rejected it. This, and nothing supplied by the client (query string,
 * Referer, flags), is what may trigger the stale-cookie cleanup.
 */
export function sessionWasRejected(state: SessionState): boolean {
  return state.status === 'rejected'
}

export async function getPageSession(): Promise<SessionState> {
  try {
    return await verifySession()
  } catch (e) {
    if (e instanceof ConfigError) return { status: 'unavailable' }
    throw e
  }
}
