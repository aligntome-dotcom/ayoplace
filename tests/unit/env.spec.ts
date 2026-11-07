import { test, expect } from '@playwright/test'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { ConfigError, getXanoBaseUrl, parseXanoBaseUrl, XANO_BASE_URL_VAR } from '../../src/lib/server/env'

const GOOD = 'https://abc-123.eu-west-1.xano.io'

test.describe('XANO_BASE_URL validation', () => {
  for (const raw of [undefined, '', '   ']) {
    test(`missing value ${JSON.stringify(raw)} is a ConfigError that names the variable`, () => {
      expect(() => parseXanoBaseUrl(raw)).toThrow(ConfigError)
      expect(() => parseXanoBaseUrl(raw)).toThrow(/XANO_BASE_URL is not set/)
      expect(() => parseXanoBaseUrl(raw)).toThrow(/https:\/\/<instance-subdomain>/)
    })
  }

  const bad: Array<[string, RegExp]> = [
    ['not a url', /whitespace, non-ASCII or control characters/],
    ['notaurl', /not a valid URL/],
    ['abc.xano.io', /not a valid URL/],
    ['http://abc.xano.io', /must use https/],
    ['ftp://abc.xano.io', /must use https/],
    ['https://localhost', /fully qualified hostname/],
    ['https://user:pw@abc.xano.io', /credentials/],
    ['https://abc.xano.io:8443', /port/],
    ['https://abc.xano.io/api:QKPf7var', /no path/],
    ['https://abc.xano.io/v1/', /no path/],
    ['https://abc.xano.io/?x=1', /query/],
    ['https://abc.xano.io/#frag', /fragment/],
  ]
  for (const [raw, why] of bad) {
    test(`rejects ${raw}`, () => {
      expect(() => parseXanoBaseUrl(raw)).toThrow(ConfigError)
      expect(() => parseXanoBaseUrl(raw)).toThrow(why)
    })
  }

  test('error messages never echo the supplied value', () => {
    const secretish = 'https://user:topsecret@abc.xano.io'
    let message = ''
    try {
      parseXanoBaseUrl(secretish)
    } catch (e) {
      message = (e as Error).message
    }
    expect(message).not.toContain('topsecret')
    expect(message).not.toContain('abc.xano.io')
  })

  test('accepts a plain https origin, with or without trailing slash', () => {
    expect(parseXanoBaseUrl(GOOD).origin).toBe(GOOD)
    expect(parseXanoBaseUrl(`${GOOD}/`).origin).toBe(GOOD)
    expect(parseXanoBaseUrl(`  ${GOOD}  `).origin).toBe(GOOD)
  })

  test('getXanoBaseUrl reads only XANO_BASE_URL from the given environment', () => {
    expect(getXanoBaseUrl({ [XANO_BASE_URL_VAR]: GOOD }).origin).toBe(GOOD)
    expect(() => getXanoBaseUrl({})).toThrow(ConfigError)
    expect(() => getXanoBaseUrl({ NEXT_PUBLIC_XANO_BASE_URL: GOOD })).toThrow(ConfigError)
  })

  test('no server module reads a NEXT_PUBLIC_ variable or hard-codes a Xano host', () => {
    const files: string[] = []
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name)
        if (statSync(p).isDirectory()) walk(p)
        else files.push(p)
      }
    }
    walk(join(process.cwd(), 'src', 'lib'))
    expect(files.length).toBeGreaterThan(0)
    for (const file of files) {
      const text = readFileSync(file, 'utf8')
      expect(text, file).not.toMatch(/NEXT_PUBLIC_/)
      expect(text, file).not.toMatch(/https:\/\/[a-z0-9-]+\.[a-z0-9-]+\.xano\.io/i)
    }
  })
})
