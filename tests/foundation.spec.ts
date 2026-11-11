import { test, expect } from '@playwright/test'

// Phase P1 foundation checks against the production build: fonts are
// self-hosted (no Google Fonts request, no Referer leak), the hero still
// renders with its original families, the public tokens are scoped to the
// home page's <main>, and the auth pages are unaffected.

test.describe('public-experience foundation', () => {
  test('home page makes no request to Google Fonts and uses self-hosted fonts', async ({ page }) => {
    const external: string[] = []
    page.on('request', (r) => {
      const url = r.url()
      if (/fonts\.googleapis\.com|fonts\.gstatic\.com/.test(url)) external.push(url)
    })
    await page.goto('/')
    await expect(page.locator('canvas.ayo-hero__canvas')).toBeVisible()
    await page.evaluate(() => document.fonts.ready)
    expect(external, 'no Google Fonts requests').toEqual([])

    const html = await page.content()
    expect(html).not.toContain('fonts.googleapis.com')
    expect(html).toMatch(/\/_next\/static\/media\/[^"]+\.woff2/)

    const fams = await page.evaluate(() => ({
      title: getComputedStyle(document.querySelector('.ayo-hero__title')!).fontFamily,
      lede: getComputedStyle(document.querySelector('.ayo-hero__lede')!).fontFamily,
      cta: getComputedStyle(document.querySelector('.ayo-hero__cta')!).fontFamily,
      body: getComputedStyle(document.body).fontFamily,
    }))
    // next/font renames families (e.g. __Great_Vibes_abc123); the original
    // literal names remain as fallbacks, so the stack must name both.
    expect(fams.title).toMatch(/Great.?Vibes/i)
    expect(fams.lede).toMatch(/Cormorant/i)
    expect(fams.cta).toMatch(/Cormorant/i)
    // The body stack is untouched: nothing was applied globally.
    expect(fams.body).not.toMatch(/Jost|Aboreto|Cormorant|Great/i)
  })

  test('public tokens exist on the home page scope only', async ({ page }) => {
    await page.goto('/')
    const tokens = await page.evaluate(() => {
      const main = document.querySelector('main.ayo-public')!
      const cs = getComputedStyle(main)
      const hero = getComputedStyle(document.querySelector('.ayo-hero')!)
      return {
        slate: cs.getPropertyValue('--ayo-slate').trim(),
        goldBrand: cs.getPropertyValue('--ayo-gold-brand').trim(),
        offwhite: cs.getPropertyValue('--ayo-offwhite').trim(),
        heroGold: hero.getPropertyValue('--ayo-gold').trim(),
        fontEyebrow: cs.getPropertyValue('--ayo-font-eyebrow').trim(),
        fontBody: cs.getPropertyValue('--ayo-font-body').trim(),
      }
    })
    expect(tokens.slate).toBe('#2c393f')
    expect(tokens.goldBrand).toBe('#e2b13c')
    expect(tokens.offwhite).toBe('#faf9f9')
    // The hero keeps its own gold for its progress bar.
    expect(tokens.heroGold).toBe('#d8b98a')
    expect(tokens.fontEyebrow).toMatch(/Aboreto/i)
    expect(tokens.fontBody).toMatch(/Jost/i)

    // Progress bar colour is unchanged.
    const barColor = await page.evaluate(() => getComputedStyle(document.querySelector('.ayo-hero__progress span')!).backgroundColor)
    expect(barColor).toBe('rgb(216, 185, 138)')
  })

  test('auth pages are outside the public scope and keep their system font', async ({ page }) => {
    await page.goto('/login')
    const r = await page.evaluate(() => ({
      scoped: document.querySelector('.ayo-public') !== null,
      heading: getComputedStyle(document.querySelector('h1')!).fontFamily,
      slate: getComputedStyle(document.body).getPropertyValue('--ayo-slate').trim(),
    }))
    expect(r.scoped).toBe(false)
    expect(r.heading).not.toMatch(/Jost|Aboreto|Cormorant|Great/i)
    expect(r.slate).toBe('')
  })
})
