import { test, expect } from '@playwright/test'
import { spawnSync } from 'node:child_process'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOT = process.cwd()

function serverModules(): string[] {
  const out: string[] = []
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name)
      if (statSync(p).isDirectory()) walk(p)
      else if (p.endsWith('.ts')) out.push(p)
    }
  }
  walk(join(ROOT, 'src', 'lib'))
  return out
}

function runNode(args: string[]) {
  return spawnSync(process.execPath, args, { cwd: ROOT, encoding: 'utf8', timeout: 20_000 })
}

test.describe('server-only boundary', () => {
  test('every module under src/lib starts with the server-only marker import', () => {
    const files = serverModules()
    expect(files.length).toBeGreaterThanOrEqual(5)
    for (const file of files) {
      // Tolerate CRLF working copies (core.autocrlf on Windows); the check itself is unchanged.
      const firstStatement = readFileSync(file, 'utf8').trimStart().split(/\r?\n/)[0]
      expect(firstStatement, relative(ROOT, file)).toBe("import 'server-only'")
    }
  })

  test('the marker throws when loaded outside a React server environment', () => {
    const r = runNode(['--input-type=module', '-e', "await import('server-only')"])
    expect(r.status).not.toBe(0)
    expect(r.stderr).toContain('cannot be imported from a Client Component')
  })

  test('the marker resolves to an empty module under the react-server condition (as in the Next server bundle)', () => {
    const r = runNode(['--conditions=react-server', '--input-type=module', '-e', "await import('server-only'); console.log('ok')"])
    expect(r.status).toBe(0)
    expect(r.stdout.trim()).toBe('ok')
  })

  test('no client component imports the server modules', () => {
    const offenders: string[] = []
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name)
        if (statSync(p).isDirectory()) walk(p)
        else if (/\.(tsx?|jsx?)$/.test(p)) {
          const text = readFileSync(p, 'utf8')
          const isClient = /^\s*['"]use client['"]/.test(text)
          if (isClient && /from ['"][^'"]*\/lib\/(server|xano|auth)\//.test(text)) offenders.push(relative(ROOT, p))
        }
      }
    }
    walk(join(ROOT, 'src'))
    expect(offenders).toEqual([])
  })
})
