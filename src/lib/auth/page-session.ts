import 'server-only'

import { ConfigError } from '../server/env'
import { verifySession, type SessionState } from './session'

/**
 * Session state for Server Components. Reads the cookie and asks Xano; never
 * writes cookies. A missing backend configuration is reported as
 * 'unavailable' so a page can render a calm notice instead of failing.
 */
export async function getPageSession(): Promise<SessionState> {
  try {
    return await verifySession()
  } catch (e) {
    if (e instanceof ConfigError) return { status: 'unavailable' }
    throw e
  }
}
