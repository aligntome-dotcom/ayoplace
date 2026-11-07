import 'server-only'

import { isWellFormedToken } from '../auth/token'
import { xanoFetch, type XanoClientOptions, type XanoResult } from './client'

/**
 * The verified authentication operations (docs/xano-contracts.md). Each
 * function sends exactly the documented request and returns the raw result;
 * response validation lives next to it so callers never touch untyped data.
 */

export const AUTH_PATHS = {
  signup: '/auth/signup',
  login: '/auth/login',
  currentUser: '/auth/me',
} as const

export interface Credentials {
  email: string
  password: string
}

export interface CustomerSignup extends Credentials {
  name: string
}

/** Success body of login and signup. */
export interface AuthResponse {
  authToken: string
  user_id: number
}

export function login(credentials: Credentials, options?: XanoClientOptions): Promise<XanoResult<unknown>> {
  return xanoFetch(
    {
      group: 'authentication',
      path: AUTH_PATHS.login,
      method: 'POST',
      body: { email: credentials.email, password: credentials.password },
    },
    options,
  )
}

/** Customer registration. The backend assigns the role; no role is sent. */
export function signupCustomer(input: CustomerSignup, options?: XanoClientOptions): Promise<XanoResult<unknown>> {
  return xanoFetch(
    {
      group: 'authentication',
      path: AUTH_PATHS.signup,
      method: 'POST',
      body: { name: input.name, email: input.email, password: input.password },
    },
    options,
  )
}

export function fetchCurrentUser(token: string, options?: XanoClientOptions): Promise<XanoResult<unknown>> {
  return xanoFetch({ group: 'authentication', path: AUTH_PATHS.currentUser, method: 'GET', token }, options)
}

/** Validates a login/signup success body; null when it does not match the contract. */
export function parseAuthResponse(data: unknown): AuthResponse | null {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return null
  const o = data as Record<string, unknown>
  if (!isWellFormedToken(o.authToken)) return null
  if (typeof o.user_id !== 'number' || !Number.isFinite(o.user_id)) return null
  return { authToken: o.authToken, user_id: o.user_id }
}
