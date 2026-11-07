import { test, expect } from '@playwright/test'
import { isRole, parseCurrentUser, ROLES } from '../../src/lib/auth/current-user'

test.describe('current-user contract (GET /auth/me)', () => {
  test('the verified role set, nothing more', () => {
    expect(ROLES).toEqual(['customer', 'event_planner', 'staff', 'manager', 'admin'])
    for (const r of ROLES) expect(isRole(r)).toBe(true)
    for (const bad of ['Customer', 'owner', 'worker', 'superadmin', '', null, 1, undefined]) expect(isRole(bad), String(bad)).toBe(false)
  })

  test('accepts the documented success shape and passes known optional fields through', () => {
    const user = parseCurrentUser({
      id: 14,
      name: 'Jane Doe',
      email: 'jane@example.com',
      role: 'customer',
      experience: 'customer',
      is_active: true,
      created_at: 1711929600000,
    })
    expect(user).toEqual({ id: 14, name: 'Jane Doe', email: 'jane@example.com', role: 'customer', is_active: true })
    // Unverified fields are not carried along.
    expect(user && 'experience' in user).toBe(false)
    expect(user && 'status' in user).toBe(false)
  })

  test('only role and is_active are required', () => {
    expect(parseCurrentUser({ role: 'staff', is_active: true })).toEqual({ role: 'staff', is_active: true })
    expect(parseCurrentUser({ role: 'customer', is_active: false })).toEqual({ role: 'customer', is_active: false })
  })

  test('invalid roles are rejected', () => {
    for (const role of ['owner', 'worker', 'CUSTOMER', '', null, 5, ['customer'], { v: 'customer' }]) {
      expect(parseCurrentUser({ role, is_active: true }), JSON.stringify(role)).toBeNull()
    }
  })

  test('missing or non-boolean is_active is rejected', () => {
    for (const is_active of [undefined, null, 'true', 1, 0, 'yes', [], {}]) {
      expect(parseCurrentUser({ role: 'customer', is_active }), JSON.stringify(is_active)).toBeNull()
    }
    expect(parseCurrentUser({ role: 'customer' })).toBeNull()
  })

  test('non-object bodies are rejected', () => {
    for (const data of [null, undefined, '', 'customer', 0, 14, true, [], [{ role: 'customer', is_active: true }], {}]) {
      expect(parseCurrentUser(data), JSON.stringify(data)).toBeNull()
    }
  })

  test('badly typed optional fields are dropped, not trusted', () => {
    const user = parseCurrentUser({ role: 'customer', is_active: true, id: '14', name: 7, email: null })
    expect(user).toEqual({ role: 'customer', is_active: true })
  })
})
