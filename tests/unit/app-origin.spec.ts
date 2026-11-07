import { test, expect } from '@playwright/test'
import { ConfigError, getAppOrigin, parseAppOrigin } from '../../src/lib/server/env'

test.describe('APP_ORIGIN', () => {
  test('accepts an https origin and http on localhost only', () => {
    expect(parseAppOrigin('https://www.theayoplace.com')).toBe('https://www.theayoplace.com')
    expect(parseAppOrigin('https://www.theayoplace.com/')).toBe('https://www.theayoplace.com')
    expect(parseAppOrigin('https://preview-abc.vercel.app')).toBe('https://preview-abc.vercel.app')
    expect(parseAppOrigin('http://localhost:3000')).toBe('http://localhost:3000')
    expect(parseAppOrigin('http://127.0.0.1:3000')).toBe('http://127.0.0.1:3000')
  })

  test('rejects everything that is not a bare trusted origin', () => {
    for (const bad of [
      undefined,
      '',
      'www.theayoplace.com',
      'http://www.theayoplace.com',
      'https://user:pw@www.theayoplace.com',
      'https://www.theayoplace.com/login',
      'https://www.theayoplace.com/?x=1',
      'https://www.theayoplace.com/#x',
      'https://1.2.3.4',
      'https://www.theayoplace.com​',
      'https://www.theayo place.com',
      'ftp://www.theayoplace.com',
    ]) {
      expect(() => parseAppOrigin(bad), JSON.stringify(bad)).toThrow(ConfigError)
    }
  })

  test('never echoes the value and reads only APP_ORIGIN', () => {
    let message = ''
    try {
      parseAppOrigin('https://user:topsecret@www.theayoplace.com')
    } catch (e) {
      message = (e as Error).message
    }
    expect(message).not.toContain('topsecret')
    expect(getAppOrigin({ APP_ORIGIN: 'https://www.theayoplace.com' })).toBe('https://www.theayoplace.com')
    expect(() => getAppOrigin({ NEXT_PUBLIC_APP_ORIGIN: 'https://www.theayoplace.com' })).toThrow(ConfigError)
  })
})
