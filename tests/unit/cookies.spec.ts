import { test, expect } from '@playwright/test'
import {
  clearSessionCookie,
  hasSessionCookie,
  isValidSessionToken,
  readSessionCookie,
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
  sessionCookieAttributes,
  setSessionCookie,
  type SessionCookieStore,
} from '../../src/lib/auth/cookies'

const TOKEN = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOjE0fQ.c2lnbmF0dXJl'

type SetCall = { name: string; value: string; options?: Record<string, unknown> }

function fakeStore(initial: Record<string, string> = {}) {
  const jar = new Map(Object.entries(initial))
  const sets: SetCall[] = []
  const store: SessionCookieStore = {
    get: (name) => (jar.has(name) ? { value: jar.get(name)! } : undefined),
    set: (name, value, options) => {
      sets.push({ name, value, options: options as Record<string, unknown> })
      if (options?.maxAge === 0) jar.delete(name)
      else jar.set(name, value)
    },
  }
  return { store, sets, jar }
}

test.describe('session cookie', () => {
  test('attributes: HTTP-only, Lax, path /, 24 h, Secure in production only', () => {
    const prod = sessionCookieAttributes({ NODE_ENV: 'production' })
    expect(prod).toEqual({ httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 86_400 })
    expect(sessionCookieAttributes({ NODE_ENV: 'development' }).secure).toBe(false)
    expect(sessionCookieAttributes({}).secure).toBe(false)
    expect(SESSION_MAX_AGE_SECONDS).toBe(24 * 60 * 60)
    expect(SESSION_COOKIE_NAME).toBe('ayo_session')
  })

  test('setSessionCookie writes the token with the full attribute set', async () => {
    const { store, sets } = fakeStore()
    await setSessionCookie(TOKEN, store)
    expect(sets).toHaveLength(1)
    expect(sets[0].name).toBe(SESSION_COOKIE_NAME)
    expect(sets[0].value).toBe(TOKEN)
    expect(sets[0].options).toMatchObject({ httpOnly: true, sameSite: 'lax', path: '/', maxAge: 86_400 })
    expect(typeof sets[0].options?.secure).toBe('boolean')
  })

  test('setSessionCookie refuses malformed tokens and writes nothing', async () => {
    const { store, sets } = fakeStore()
    for (const bad of ['', 'with space', 'a\nb', 'x'.repeat(4001), 'semi;colon']) {
      let message = ''
      await setSessionCookie(bad, store).catch((e: Error) => {
        message = e.message
      })
      expect(message, JSON.stringify(bad)).toMatch(/malformed/)
      if (bad.length > 0) expect(message).not.toContain(bad)
      expect(isValidSessionToken(bad)).toBe(false)
    }
    expect(sets).toHaveLength(0)
  })

  test('readSessionCookie returns the value, or null when absent or malformed', async () => {
    expect(await readSessionCookie(fakeStore({ [SESSION_COOKIE_NAME]: TOKEN }).store)).toBe(TOKEN)
    expect(await readSessionCookie(fakeStore().store)).toBeNull()
    expect(await readSessionCookie(fakeStore({ [SESSION_COOKIE_NAME]: '' }).store)).toBeNull()
    expect(await readSessionCookie(fakeStore({ [SESSION_COOKIE_NAME]: 'bad value' }).store)).toBeNull()
    expect(await readSessionCookie(fakeStore({ other: TOKEN }).store)).toBeNull()
  })

  test('hasSessionCookie reports presence only', async () => {
    expect(await hasSessionCookie(fakeStore({ [SESSION_COOKIE_NAME]: TOKEN }).store)).toBe(true)
    expect(await hasSessionCookie(fakeStore({ [SESSION_COOKIE_NAME]: 'garbage!' }).store)).toBe(true)
    expect(await hasSessionCookie(fakeStore().store)).toBe(false)
  })

  test('clearSessionCookie expires the cookie with matching attributes', async () => {
    const { store, sets, jar } = fakeStore({ [SESSION_COOKIE_NAME]: TOKEN })
    await clearSessionCookie(store)
    expect(sets).toHaveLength(1)
    expect(sets[0].name).toBe(SESSION_COOKIE_NAME)
    expect(sets[0].value).toBe('')
    expect(sets[0].options).toMatchObject({ httpOnly: true, sameSite: 'lax', path: '/', maxAge: 0 })
    expect((sets[0].options?.expires as Date).getTime()).toBe(0)
    expect(jar.has(SESSION_COOKIE_NAME)).toBe(false)
    expect(await hasSessionCookie(store)).toBe(false)
  })
})
