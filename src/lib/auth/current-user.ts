import 'server-only'

/**
 * The verified shape of Xano's current-user response (GET /auth/me), see
 * docs/xano-contracts.md. Only `role` and `is_active` are required; `id`,
 * `name` and `email` are passed through when present and well-typed. No
 * other field is assumed, and `status` is never read (it is not returned).
 */

export const ROLES = ['customer', 'event_planner', 'staff', 'manager', 'admin'] as const
export type Role = (typeof ROLES)[number]

export interface CurrentUser {
  role: Role
  is_active: boolean
  id?: number
  name?: string
  email?: string
}

export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (ROLES as readonly string[]).includes(value)
}

/**
 * Returns the typed current user, or null when the value does not satisfy the
 * verified contract. A null here must never become an authenticated session.
 */
export function parseCurrentUser(data: unknown): CurrentUser | null {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return null
  const o = data as Record<string, unknown>
  if (!isRole(o.role)) return null
  if (typeof o.is_active !== 'boolean') return null

  const user: CurrentUser = { role: o.role, is_active: o.is_active }
  if (typeof o.id === 'number' && Number.isFinite(o.id)) user.id = o.id
  if (typeof o.name === 'string') user.name = o.name
  if (typeof o.email === 'string') user.email = o.email
  return user
}
