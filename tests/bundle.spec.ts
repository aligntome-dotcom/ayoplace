import { test, expect } from '@playwright/test'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

// Runs against the production build output. Verifies that nothing from the
// server-side Xano integration reaches the browser bundle.
const STATIC = join(process.cwd(), '.next', 'static')
const SSR_HTML = join(process.cwd(), '.next', 'server', 'app', 'index.html')

const FORBIDDEN = ['XANO_BASE_URL', 'api:QKPf7var', 'ayo_session', 'Bearer ', 'server-only', 'xano.io']

function jsFiles(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) out.push(...jsFiles(p))
    else if (p.endsWith('.js')) out.push(p)
  }
  return out
}

test.describe('client bundle', () => {
  test.skip(!existsSync(STATIC), 'run `npm run build` first')

  test('contains no Xano configuration, cookie name or bearer tokens', () => {
    const files = jsFiles(STATIC)
    expect(files.length).toBeGreaterThan(0)
    for (const file of files) {
      const text = readFileSync(file, 'utf8')
      for (const needle of FORBIDDEN) {
        expect(text.includes(needle), `${needle} in ${relative(process.cwd(), file)}`).toBe(false)
      }
    }
  })

  test('server-rendered home page carries none of it either', () => {
    test.skip(!existsSync(SSR_HTML), 'no prerendered page')
    const html = readFileSync(SSR_HTML, 'utf8')
    for (const needle of FORBIDDEN) expect(html.includes(needle), needle).toBe(false)
  })
})
