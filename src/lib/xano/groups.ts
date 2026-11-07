import 'server-only'

/**
 * Xano API groups, keyed by purpose. Each value is the group's canonical path
 * on the instance, as verified in the Phase 2A backend audit.
 *
 * Add a group here when a new verified API group is needed. Never derive a
 * group path from request input, and do not append a branch suffix unless a
 * branch-routing requirement has been explicitly configured and verified.
 */
export const XANO_API_GROUPS = {
  /** Authentication group (signup, login, current user, password reset). */
  authentication: '/api:QKPf7var',
} as const

export type XanoApiGroup = keyof typeof XANO_API_GROUPS
