import { test, expect, type Page } from '@playwright/test'

// Stage B (the editorial introduction) over the production build.

async function scrollHeroToEnd(page: Page) {
  // Scroll to the end of the hero track so the introduction follows.
  await page.evaluate(() => {
    const s = document.querySelector('.ayo-hero')!
    const total = s.getBoundingClientRect().height - innerHeight
    window.scrollTo(0, Math.round(window.scrollY + s.getBoundingClientRect().top + total))
  })
}

test.describe('stage B introduction', () => {
  test('renders after the hero and before the account entry, with the approved copy in order', async ({ page }) => {
    await page.goto('/')
    const order = await page.evaluate(() =>
      Array.from(document.querySelectorAll('main > *'))
        .map((el) => el.className.split(' ')[0] || el.id || el.tagName)
        .filter(Boolean),
    )
    const hero = order.indexOf('ayo-hero')
    const intro = order.indexOf('ayo-intro')
    expect(hero).toBeGreaterThanOrEqual(0)
    expect(intro).toBeGreaterThan(hero)
    const book = await page.locator('#book').count()
    expect(book).toBe(1)
    expect(await page.evaluate(() => document.querySelector('.ayo-intro')!.compareDocumentPosition(document.querySelector('#book')!) & Node.DOCUMENT_POSITION_FOLLOWING)).toBeTruthy()

    const intro$ = page.locator('.ayo-intro')
    const text = (await intro$.innerText()).replace(/\s+/g, ' ')
    const expected = [
      'AFTER THE WALKTHROUGH',
      'Two names, one celebration.',
      'THE VENUE',
      'The Ayo Place',
      'A family-owned venue in Grandville, Michigan, named for the Yoruba word for joy.',
      'Where people gather.',
      'THE PLANNING COMPANION',
      'Ayo AI',
      'A planning companion for the people who celebrate here.',
      'PROVISIONAL · OWNER CONFIRMATION REQUIRED',
      'Enquire about dates, request quotes and keep every detail of your event in one place.',
      'How the day gets planned.',
      'One is a place. The other helps you plan what happens there.',
      'CONTINUE',
    ]
    let cursor = 0
    for (const phrase of expected) {
      const at = text.toUpperCase().indexOf(phrase.toUpperCase(), cursor)
      expect(at, `"${phrase}" in order`).toBeGreaterThanOrEqual(0)
      cursor = at + phrase.length
    }
    // "AI" is the emphasised word, set in the italic face.
    const em = intro$.locator('.ayo-intro__em')
    await expect(em).toHaveText('AI')
    const emStyle = await em.evaluate((el) => ({ style: getComputedStyle(el).fontStyle, family: getComputedStyle(el).fontFamily }))
    expect(emStyle.style).toBe('italic')
    expect(emStyle.family).toMatch(/Cormorant/i)
    // The provisional qualification is present and labelled.
    await expect(intro$.locator('.ayo-intro__provisional')).toHaveAttribute('role', 'note')
    await expect(intro$.locator('.ayo-intro__provisional-label')).toHaveText(/provisional · owner confirmation required/i)
    // No form, no booking, no AI feature claims.
    expect(await intro$.locator('form, input, select, button').count()).toBe(0)
    expect(text).not.toMatch(/book(ed|ing)? a tour|calendar|automat/i)
  })

  test('design tokens and typography: deep-ink field, ivory type, gold accents, approved fonts', async ({ page }) => {
    await page.goto('/')
    const s = await page.evaluate(() => {
      const g = (sel: string, prop: string) => getComputedStyle(document.querySelector(sel)!).getPropertyValue(prop)
      return {
        bg: g('.ayo-intro', 'background-color'),
        title: g('.ayo-intro__title', 'font-family'),
        titleColor: g('.ayo-intro__title', 'color'),
        eyebrow: g('.ayo-intro__eyebrow', 'font-family'),
        eyebrowColor: g('.ayo-intro__eyebrow', 'color'),
        body: g('.ayo-intro__text', 'font-family'),
        divider: g('.ayo-intro__divider', 'background-color'),
        heroGold: g('.ayo-hero__progress span', 'background-color'),
      }
    })
    expect(s.bg).toBe('rgb(16, 22, 26)')
    expect(s.title).toMatch(/Cormorant/i)
    expect(s.titleColor).toBe('rgb(244, 236, 221)')
    expect(s.eyebrow).toMatch(/Aboreto/i)
    expect(s.eyebrowColor).toBe('rgb(226, 177, 60)')
    expect(s.body).toMatch(/Jost/i)
    expect(s.divider).toBe('rgb(226, 177, 60)')
    expect(s.heroGold).toBe('rgb(216, 185, 138)') // hero untouched
  })

  test('reveals once it enters the viewport; items are hidden before and visible after, without layout shift', async ({ page }) => {
    await page.goto('/')
    const intro = page.locator('.ayo-intro')
    await expect(intro).toHaveAttribute('data-reveal', 'pending')
    const before = await intro.locator('.ayo-intro__title').evaluate((el) => ({
      opacity: getComputedStyle(el).opacity,
      rect: el.getBoundingClientRect().height,
    }))
    expect(Number(before.opacity)).toBe(0)

    await scrollHeroToEnd(page)
    await page.evaluate(() => window.scrollBy(0, 200))
    await expect(intro).toHaveAttribute('data-reveal', 'done')
    await expect.poll(() => intro.locator('.ayo-intro__title').evaluate((el) => Number(getComputedStyle(el).opacity)), { timeout: 5000 }).toBe(1)
    await expect.poll(() => intro.locator('.ayo-intro__divider').evaluate((el) => getComputedStyle(el).transform), { timeout: 5000 }).toMatch(/none|matrix\(1, 0, 0, 1, 0, 0\)/)
    const after = await intro.locator('.ayo-intro__title').evaluate((el) => el.getBoundingClientRect().height)
    expect(after).toBe(before.rect) // opacity/transform only: no layout change
    // One-shot: scrolling back up does not re-hide.
    await page.evaluate(() => window.scrollTo(0, 0))
    await page.waitForTimeout(300)
    await expect(intro).toHaveAttribute('data-reveal', 'done')
  })

  test('with reduced motion the content is visible immediately with no transition', async ({ browser }, info) => {
    const context = await browser.newContext({ ...info.project.use, reducedMotion: 'reduce' })
    const page = await context.newPage()
    await page.goto('/')
    const intro = page.locator('.ayo-intro')
    await expect(intro).toHaveAttribute('data-reveal', 'done')
    const s = await intro.locator('.ayo-intro__title').evaluate((el) => ({
      opacity: getComputedStyle(el).opacity,
      transition: getComputedStyle(el).transitionDuration,
      transform: getComputedStyle(el).transform,
    }))
    expect(Number(s.opacity)).toBe(1)
    expect(s.transition).toMatch(/^0s/)
    expect(s.transform).toBe('none')
    await context.close()
  })

  test('CONTINUE is a link to #book that scrolls to the Stage C anchor and nothing else', async ({ page }) => {
    await page.goto('/')
    const link = page.locator('.ayo-intro__continue')
    await expect(link).toHaveAttribute('href', '#book')
    await scrollHeroToEnd(page)
    await page.evaluate(() => window.scrollBy(0, 200))
    await expect(page.locator('.ayo-intro')).toHaveAttribute('data-reveal', 'done')
    await link.click()
    await expect.poll(() => page.evaluate(() => location.hash)).toBe('#book')
    await expect.poll(() => page.evaluate(() => Math.abs(document.querySelector('#book')!.getBoundingClientRect().top)), { timeout: 5000 }).toBeLessThan(4)
    expect(page.url()).not.toMatch(/\/(signup|login)/)
    expect(await page.locator('form').count()).toBe(0)
  })

  test('mobile: statements stack and the divider turns horizontal; desktop: two columns', async ({ page }, info) => {
    await page.goto('/')
    const m = await page.evaluate(() => {
      const cols = document.querySelectorAll('.ayo-intro__column')
      const a = cols[0].getBoundingClientRect()
      const b = cols[1].getBoundingClientRect()
      // offsetWidth/Height ignore the pending-state scale transform on the divider.
      const d = document.querySelector<HTMLElement>('.ayo-intro__divider')!
      const intro = document.querySelector('.ayo-intro')!.getBoundingClientRect()
      return { stacked: b.top >= a.bottom - 1, sideBySide: Math.abs(a.top - b.top) < 2 && b.left > a.right, dividerWide: d.offsetWidth > d.offsetHeight, introWidth: intro.width, vw: innerWidth, padLeft: getComputedStyle(document.querySelector('.ayo-intro')!).paddingLeft }
    })
    if (info.project.name === 'mobile') {
      expect(m.stacked).toBe(true)
      expect(m.dividerWide).toBe(true)
      expect(m.padLeft).toBe('28px')
    } else {
      expect(m.sideBySide).toBe(true)
      expect(m.dividerWide).toBe(false)
      expect(m.padLeft).toBe('120px')
    }
    expect(m.introWidth).toBeLessThanOrEqual(m.vw)
    const minH = await page.locator('.ayo-intro').evaluate((el) => el.getBoundingClientRect().height)
    expect(minH).toBeGreaterThanOrEqual(page.viewportSize()!.height - 1)
  })
})
