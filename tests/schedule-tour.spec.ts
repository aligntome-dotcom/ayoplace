import { test, expect, type Page } from '@playwright/test'

// Stage C (Schedule a Tour) over the production build.

async function scrollToStageC(page: Page) {
  await page.evaluate(() => document.querySelector('#book')!.scrollIntoView({ block: 'start' }))
  await expect(page.locator('.ayo-tour')).toHaveAttribute('data-reveal', 'done')
  await expect.poll(() => page.locator('.ayo-tour__title').evaluate((el) => Number(getComputedStyle(el).opacity)), { timeout: 5000 }).toBe(1)
}

test.describe('stage C schedule a tour', () => {
  test('replaces the old account-entry cards, carries #book, and follows Stage B', async ({ page }) => {
    await page.goto('/')
    const html = await page.content()
    expect(html).not.toContain('Registration opens soon')
    expect(html).not.toContain('Event planners')
    expect(html).not.toContain('account-entry')
    expect(await page.locator('#book').count()).toBe(1)
    await expect(page.locator('#book')).toHaveClass(/ayo-tour/)
    const order = await page.evaluate(() => {
      const intro = document.querySelector('.ayo-intro')!
      const tour = document.querySelector('#book')!
      return Boolean(intro.compareDocumentPosition(tour) & Node.DOCUMENT_POSITION_FOLLOWING)
    })
    expect(order).toBe(true)
    // Heading hierarchy: one h1 (hero), h2 for Stage B and C, h3 for the steps.
    expect(await page.locator('h1').count()).toBe(1)
    await expect(page.locator('#book h2')).toHaveText('See the rooms for yourself.')
    expect(await page.locator('#book h3').count()).toBe(3)
  })

  test('shows the approved content in order, with the accurate journey wording', async ({ page }) => {
    await page.goto('/')
    const text = (await page.locator('#book').innerText()).replace(/\s+/g, ' ')
    const expected = [
      'NEXT STEP',
      'See the rooms for yourself.',
      'Create a customer account to get started with The Ayo Place.',
      'contact our team to arrange an in-person visit or FaceTime consultation.',
      'Creating an account does not book or request a tour.',
      'SCHEDULE A TOUR',
      'Already have an account? Sign in',
      'Leads to customer sign-up. Nothing is booked or requested at this step.',
      '01',
      'Create your account',
      '02',
      'Enter your customer account',
      '03',
      'Arrange your visit',
      'in-person visit or FaceTime consultation.',
      '3055 Red Mill Avenue, Grandville, Michigan',
      '(616) 271-0155',
    ]
    let cursor = 0
    for (const phrase of expected) {
      const at = text.toUpperCase().indexOf(phrase.toUpperCase(), cursor)
      expect(at, `"${phrase}" in order`).toBeGreaterThanOrEqual(0)
      cursor = at + phrase.length
    }
    // Nothing promises a booking, a slot or a planning workspace. (The approved
    // caption "Nothing is booked or requested at this step" is the one
    // permitted use of "booked".)
    expect(text.replace('Nothing is booked or requested at this step.', '')).not.toMatch(
      /booked|confirmed|calendar|available slot|instant|same-day|planning space|planning experience|workspace/i,
    )
  })

  test('the primary action leads to the existing customer sign-up; the text link to sign-in; nothing else is interactive', async ({ page }) => {
    await page.goto('/')
    const primary = page.locator('.ayo-tour__primary')
    await expect(primary).toHaveAttribute('href', '/signup')
    await expect(page.locator('.ayo-tour__link')).toHaveAttribute('href', '/login')
    await expect(page.locator('.ayo-tour__phone')).toHaveAttribute('href', 'tel:+16162710155')
    // No form, no inputs, no buttons, no calendar: only the three links.
    expect(await page.locator('#book form, #book input, #book select, #book textarea, #book button').count()).toBe(0)
    expect(await page.locator('#book a').count()).toBe(3)
    // No private portal exposure on the public page.
    const hrefs = await page.locator('a[href]').evaluateAll((as) => as.map((a) => a.getAttribute('href')))
    for (const h of hrefs) expect(h).not.toMatch(/\/\.(staff|manager|admin|event-planner)|\/entry\//)

    await scrollToStageC(page)
    await primary.click()
    await expect(page).toHaveURL(/\/signup$/)
    await expect(page.getByRole('heading', { name: 'Create your account' })).toBeVisible()
    // The existing sign-up form, unchanged: its own fields and planner aside.
    await expect(page.getByLabel('Email')).toBeVisible()
    await expect(page.getByLabel('Password', { exact: true })).toBeVisible()

    await page.goBack()
    await scrollToStageC(page)
    await page.locator('.ayo-tour__link').click()
    await expect(page).toHaveURL(/\/login$/)
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
  })

  test('keyboard: the primary action and the sign-in link are reachable and show the gold focus ring', async ({ page }) => {
    await page.goto('/')
    await scrollToStageC(page)
    await page.locator('.ayo-tour__primary').focus()
    const ring = await page.locator('.ayo-tour__primary').evaluate((el) => ({
      color: getComputedStyle(el).outlineColor,
      width: getComputedStyle(el).outlineWidth,
    }))
    expect(ring.color).toBe('rgb(226, 177, 60)')
    expect(ring.width).toBe('2px')
    await page.keyboard.press('Tab')
    await expect(page.locator('.ayo-tour__link')).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(/\/login$/)
  })

  test('design tokens: off-white field, ink primary button, slate text, gold rule; touch targets ≥ 44 px', async ({ page }, info) => {
    await page.goto('/')
    await scrollToStageC(page)
    const s = await page.evaluate(() => {
      const g = (sel: string, prop: string) => getComputedStyle(document.querySelector(sel)!).getPropertyValue(prop)
      const r = (sel: string) => document.querySelector(sel)!.getBoundingClientRect()
      return {
        bg: g('.ayo-tour', 'background-color'),
        title: g('.ayo-tour__title', 'font-family'),
        titleColor: g('.ayo-tour__title', 'color'),
        eyebrow: g('.ayo-tour__eyebrow', 'font-family'),
        lede: g('.ayo-tour__lede', 'color'),
        rule: g('.ayo-tour__rule', 'background-color'),
        primaryBg: g('.ayo-tour__primary', 'background-color'),
        primaryFont: g('.ayo-tour__primary', 'font-family'),
        primaryTransform: g('.ayo-tour__primary', 'text-transform'),
        primary: r('.ayo-tour__primary'),
        link: r('.ayo-tour__link'),
        secondaryBox: r('.ayo-tour__secondary'),
        section: r('.ayo-tour'),
        vw: innerWidth,
        padLeft: g('.ayo-tour', 'padding-left'),
      }
    })
    expect(s.bg).toBe('rgb(250, 249, 249)')
    expect(s.title).toMatch(/Cormorant/i)
    expect(s.titleColor).toBe('rgb(15, 15, 15)')
    expect(s.eyebrow).toMatch(/Aboreto/i)
    expect(s.lede).toBe('rgb(44, 57, 63)')
    expect(s.rule).toBe('rgb(226, 177, 60)')
    expect(s.primaryBg).toBe('rgb(15, 15, 15)')
    expect(s.primaryFont).toMatch(/Jost/i)
    expect(s.primaryTransform).toBe('uppercase')
    expect(s.primary.height).toBeGreaterThanOrEqual(56)
    expect(s.secondaryBox.height).toBeGreaterThanOrEqual(44)
    expect(s.section.width).toBeLessThanOrEqual(s.vw)
    expect(s.section.height).toBeGreaterThanOrEqual(page.viewportSize()!.height - 1)
    if (info.project.name === 'mobile') {
      expect(s.padLeft).toBe('28px')
      // Full-width primary action on mobile.
      expect(Math.round(s.primary.width)).toBe(Math.round(s.vw - 56))
    } else {
      expect(s.padLeft).toBe('120px')
      expect(s.primary.width).toBeLessThan(400)
    }
  })

  test('reveals on entry without layout shift; reduced motion renders visible with no transition', async ({ page, browser }, info) => {
    await page.goto('/')
    const tour = page.locator('.ayo-tour')
    await expect(tour).toHaveAttribute('data-reveal', 'pending')
    const before = await tour.locator('.ayo-tour__title').evaluate((el) => ({ opacity: Number(getComputedStyle(el).opacity), h: el.getBoundingClientRect().height }))
    expect(before.opacity).toBe(0)
    await scrollToStageC(page)
    const after = await tour.locator('.ayo-tour__title').evaluate((el) => el.getBoundingClientRect().height)
    expect(after).toBe(before.h)

    const context = await browser.newContext({ ...info.project.use, reducedMotion: 'reduce' })
    const p2 = await context.newPage()
    await p2.goto('/')
    await expect(p2.locator('.ayo-tour')).toHaveAttribute('data-reveal', 'done')
    const s = await p2.locator('.ayo-tour__title').evaluate((el) => ({ opacity: Number(getComputedStyle(el).opacity), t: getComputedStyle(el).transitionDuration }))
    expect(s.opacity).toBe(1)
    expect(s.t).toMatch(/^0s/)
    await context.close()
  })

  test('Stage B CONTINUE and the hero call-to-action both land on Stage C', async ({ page }) => {
    await page.goto('/')
    await page.evaluate(() => document.querySelector('.ayo-intro')!.scrollIntoView({ block: 'start' }))
    await expect(page.locator('.ayo-intro')).toHaveAttribute('data-reveal', 'done')
    await page.locator('.ayo-intro__continue').click()
    await expect.poll(() => page.evaluate(() => location.hash)).toBe('#book')
    await expect.poll(() => page.evaluate(() => Math.abs(document.querySelector('.ayo-tour')!.getBoundingClientRect().top)), { timeout: 5000 }).toBeLessThan(4)
    await expect(page.locator('.ayo-tour')).toHaveAttribute('data-reveal', 'done')
  })
})
