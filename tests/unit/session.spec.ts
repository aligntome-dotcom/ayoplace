import { test, expect } from '@playwright/test'
import { verifySession, type CurrentUserFetcher } from '../../src/lib/auth/session'
import { SESSION_COOKIE_NAME, type SessionCookieStore } from '../../src/lib/auth/cookies'
import { XanoError, type XanoResult } from '../../src/lib/xano/client'

const TOKEN = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOjE0fQ.c2lnbmF0dXJl'

function storeWith(value?: string): SessionCookieStore & { sets: number } {
  const s = {
    sets: 0,
    get: (name: string) => (value !== undefined && name === SESSION_COOKIE_NAME ? { value } : undefined),
    set: () => {
      s.sets += 1
    },
  }
  return s
}

function fetcher(result: XanoResult<unknown>): CurrentUserFetcher & { calls: string[] } {
  const calls: string[] = []
  const f = (async (token: string) => {
    calls.push(token)
    return result
  }) as CurrentUserFetcher & { calls: string[] }
  f.calls = calls
  return f
}

const http = (status: number) => new XanoError('http', `Xano responded with HTTP ${status}`, { status })

test.describe('verifySession', () => {
  test('no cookie → anonymous, and Xano is not called', async () => {
    const f = fetcher({ ok: true, status: 200, data: {} })
    expect(await verifySession(f, storeWith())).toEqual({ status: 'anonymous' })
    expect(f.calls).toHaveLength(0)
  })

  test('malformed cookie → anonymous, and Xano is not called', async () => {
    const f = fetcher({ ok: true, status: 200, data: {} })
    expect(await verifySession(f, storeWith('not a token'))).toEqual({ status: 'anonymous' })
    expect(f.calls).toHaveLength(0)
  })

  test('a cookie alone never authenticates: Xano must accept the token', async () => {
    const user = { id: 14, role: 'customer', is_active: true }
    const f = fetcher({ ok: true, status: 200, data: user })
    const state = await verifySession(f, storeWith(TOKEN))
    expect(state).toEqual({ status: 'authenticated', user })
    expect(f.calls).toEqual([TOKEN])
  })

  test('401 and 403 from Xano → rejected', async () => {
    for (const status of [401, 403]) {
      const state = await verifySession(fetcher({ ok: false, error: http(status) }), storeWith(TOKEN))
      expect(state, String(status)).toEqual({ status: 'rejected' })
    }
  })

  test('transport failures and other backend errors → unavailable, not anonymous', async () => {
    const cases = [
      new XanoError('network', 'Xano could not be reached'),
      new XanoError('timeout', 'timed out'),
      new XanoError('invalid_response', 'bad body'),
      http(500),
      http(502),
    ]
    for (const error of cases) {
      const state = await verifySession(fetcher({ ok: false, error }), storeWith(TOKEN))
      expect(state, error.kind).toEqual({ status: 'unavailable' })
    }
  })

  test('never writes cookies and never puts the token in the returned state', async () => {
    const store = storeWith(TOKEN)
    const states = [
      await verifySession(fetcher({ ok: true, status: 200, data: { id: 1 } }), store),
      await verifySession(fetcher({ ok: false, error: http(401) }), store),
      await verifySession(fetcher({ ok: false, error: http(500) }), store),
    ]
    expect(store.sets).toBe(0)
    for (const s of states) expect(JSON.stringify(s)).not.toContain(TOKEN)
  })
})
