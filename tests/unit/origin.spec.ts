import { test, expect } from '@playwright/test'
import { checkRequestOrigin } from '../../src/lib/auth/origin'

const APP = 'https://www.theayoplace.com'
const h = (init: Record<string, string>) => new Headers(init)

test.describe('checkRequestOrigin', () => {
  test('exact Origin match passes', () => {
    expect(checkRequestOrigin(h({ origin: APP }), APP)).toEqual({ ok: true })
    expect(checkRequestOrigin(h({ origin: 'HTTPS://WWW.THEAYOPLACE.COM' }), APP)).toEqual({ ok: true })
    expect(checkRequestOrigin(h({ origin: APP }), `${APP}/`)).toEqual({ ok: true })
  })

  test('any other Origin is a mismatch', () => {
    for (const origin of [
      'https://evil.example',
      'https://theayoplace.com', // apex vs www is a different origin
      'https://www.theayoplace.com.evil.example',
      'http://www.theayoplace.com', // scheme
      'https://www.theayoplace.com:8443', // port
      'null',
      'garbage',
    ]) {
      expect(checkRequestOrigin(h({ origin }), APP), origin).toEqual({ ok: false, reason: 'mismatch' })
    }
  })

  test('missing Origin falls back to the Referer origin only', () => {
    expect(checkRequestOrigin(h({ referer: `${APP}/login?next=/customer` }), APP)).toEqual({ ok: true })
    expect(checkRequestOrigin(h({ referer: 'https://evil.example/page' }), APP)).toEqual({ ok: false, reason: 'mismatch' })
    expect(checkRequestOrigin(h({ referer: 'not a url' }), APP)).toEqual({ ok: false, reason: 'missing' })
    expect(checkRequestOrigin(h({}), APP)).toEqual({ ok: false, reason: 'missing' })
  })

  test('Origin wins over Referer when both are present', () => {
    expect(checkRequestOrigin(h({ origin: 'https://evil.example', referer: `${APP}/x` }), APP)).toEqual({
      ok: false,
      reason: 'mismatch',
    })
  })

  test('Sec-Fetch-Site cross-site vetoes even a matching Origin, but is never sufficient alone', () => {
    expect(checkRequestOrigin(h({ origin: APP, 'sec-fetch-site': 'cross-site' }), APP)).toEqual({
      ok: false,
      reason: 'mismatch',
    })
    expect(checkRequestOrigin(h({ origin: APP, 'sec-fetch-site': 'same-origin' }), APP)).toEqual({ ok: true })
    expect(checkRequestOrigin(h({ 'sec-fetch-site': 'same-origin' }), APP)).toEqual({ ok: false, reason: 'missing' })
    expect(checkRequestOrigin(h({ origin: 'https://evil.example', 'sec-fetch-site': 'same-origin' }), APP)).toEqual({
      ok: false,
      reason: 'mismatch',
    })
  })

  test('an unusable configured origin fails closed', () => {
    for (const bad of ['', 'not a url', 'null']) {
      expect(checkRequestOrigin(h({ origin: APP }), bad), JSON.stringify(bad)).toEqual({
        ok: false,
        reason: 'invalid_config',
      })
    }
  })
})
