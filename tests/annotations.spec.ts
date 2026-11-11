import { test, expect, type Page } from '@playwright/test'

// Hero annotations over the production build. The hero's canvas reports the
// displayed frame in data-frame; the annotation layer reads the same
// progress store, so once the canvas shows frame N the block for N must be
// in its expected state.

const FRAME_COUNT = 239
const frameToY = (p: Page, frame: number) =>
  p.evaluate((frame) => {
    const s = document.querySelector('.ayo-hero')!
    const total = s.getBoundingClientRect().height - innerHeight
    return Math.round((total * (frame - 1)) / 238)
  }, frame)

async function gotoFrame(page: Page, frame: number) {
  const y = await frameToY(page, frame)
  await page.evaluate((y) => window.scrollTo(0, y), y)
  await expect
    .poll(() => page.evaluate(() => Number((document.querySelector('canvas') as HTMLCanvasElement).dataset.frame)), {
      timeout: 20_000,
    })
    .toBe(frame)
  await page.waitForTimeout(150)
}

async function visibleBlocks(page: Page) {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLElement>('[data-annotation]'))
      .filter((el) => {
        const cs = getComputedStyle(el)
        return cs.visibility === 'visible' && cs.display !== 'none' && Number(el.style.opacity) > 0.01
      })
      .map((el) => ({
        id: el.dataset.annotation!,
        opacity: Number(el.style.opacity),
        heading: el.querySelector('.ayo-note__heading')!.textContent,
        text: el.querySelector('.ayo-note__text')!.textContent,
        rect: (() => {
          const r = el.getBoundingClientRect()
          return { left: r.left, top: r.top, right: r.right, bottom: r.bottom }
        })(),
      })),
  )
}

const PEAKS: Record<string, [number, string, string]> = {
  A2: [48, 'Ayo means joy.', 'A Yoruba word, and the reason this place exists: rooms made for laughter.'],
  A3: [100, 'Rooms that take any shape.', 'Cocktail hour, ceremony or seated dinner. The layout follows your plan.'],
  A4: [130, 'Room for up to 600.', 'Distinct spaces for every kind of gathering.'],
  A5: [154, 'Warehouse character, kept.', 'The building’s industrial character remains in view.'],
  A6: [182, 'Somewhere to settle in.', 'Lounge seating for the quieter conversations between the big moments.'],
  A7: [220, 'Set for the day itself.', 'Your caterer, your vendors, your way. Bar service and cleaning are handled here.'],
  A8: [236, 'Come and see it.', 'Same-day tours, in person or over FaceTime.'],
}

test.describe('hero annotations', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('canvas.ayo-hero__canvas')).toBeVisible()
  })

  test('each focal frame shows exactly its block with the approved copy, fully established', async ({ page }, info) => {
    const isMobile = info.project.name === 'mobile'
    const vw = page.viewportSize()!
    for (const [id, [frame, heading, text]] of Object.entries(PEAKS)) {
      await gotoFrame(page, frame)
      const blocks = await visibleBlocks(page)
      expect(blocks.map((b) => b.id), `frame ${frame}`).toEqual([id])
      expect(blocks[0].heading).toBe(heading)
      expect(blocks[0].text).toBe(text)
      expect(blocks[0].opacity).toBeGreaterThan(0.99)
      // Inside the viewport, clear of the 2 px progress bar at the bottom.
      const r = blocks[0].rect
      expect(r.left, `${id} left`).toBeGreaterThanOrEqual(isMobile ? 20 : 40)
      expect(r.right, `${id} right`).toBeLessThanOrEqual(vw.width - (isMobile ? 20 : 40))
      expect(r.top, `${id} top`).toBeGreaterThanOrEqual(0)
      expect(r.bottom, `${id} bottom`).toBeLessThanOrEqual(vw.height - (isMobile ? 40 : 64))
    }
  })

  test('A1 shows on desktop only; clear frames show nothing', async ({ page }, info) => {
    await gotoFrame(page, 20)
    const ids = (await visibleBlocks(page)).map((b) => b.id)
    if (info.project.name === 'mobile') {
      expect(ids).toEqual([])
      expect(await page.locator('[data-annotation="A1"]').evaluate((el) => getComputedStyle(el).display)).toBe('none')
    } else {
      expect(ids).toEqual(['A1'])
    }
    for (const frame of [1, 30, 75, 115, 170, 200]) {
      await gotoFrame(page, frame)
      expect((await visibleBlocks(page)).map((b) => b.id), `frame ${frame} clear`).toEqual([])
    }
  })

  test('entrance and exit are partial at the boundaries and reverse scrolling restores earlier states', async ({ page }) => {
    await gotoFrame(page, 122) // mid-entrance of A4 (in 120–125)
    let blocks = await visibleBlocks(page)
    expect(blocks.map((b) => b.id)).toEqual(['A4'])
    const headingOpacity = await page.locator('[data-annotation="A4"] .ayo-note__heading').evaluate((el) => Number(el.style.opacity))
    expect(headingOpacity).toBeGreaterThan(0)
    expect(headingOpacity).toBeLessThan(1)

    await gotoFrame(page, 141) // mid-exit (out 139–142)
    blocks = await visibleBlocks(page)
    expect(blocks.map((b) => b.id)).toEqual(['A4'])
    expect(blocks[0].opacity).toBeGreaterThan(0)
    expect(blocks[0].opacity).toBeLessThan(1)

    // Back to the focal frame: fully established again. Then back to A2.
    await gotoFrame(page, 130)
    blocks = await visibleBlocks(page)
    expect(blocks[0].opacity).toBeGreaterThan(0.99)
    await gotoFrame(page, 48)
    expect((await visibleBlocks(page)).map((b) => b.id)).toEqual(['A2'])
    await gotoFrame(page, 1)
    expect(await visibleBlocks(page)).toEqual([])
  })

  test('the last block holds through the final frame and the layer leaves with the hero', async ({ page }) => {
    await gotoFrame(page, 239)
    expect((await visibleBlocks(page)).map((b) => b.id)).toEqual(['A8'])
    // Scroll a full viewport past the hero: the layer is hidden, nothing floats over the next section.
    await page.evaluate(() => window.scrollTo(0, document.querySelector('.ayo-hero')!.getBoundingClientRect().height + window.scrollY - window.innerHeight + window.innerHeight + 10))
    await page.waitForTimeout(400)
    const layerVisibility = await page.locator('.ayo-notes').evaluate((el) => getComputedStyle(el).visibility)
    expect(layerVisibility).toBe('hidden')
  })

  test('annotation text is available to assistive technology once, with no live region', async ({ page }) => {
    const sr = page.locator('section[aria-labelledby="ayo-notes-title"]')
    await expect(sr).toHaveCount(1)
    await expect(sr.locator('li')).toHaveCount(8)
    await expect(sr.locator('li').nth(1)).toContainText('Ayo means joy.')
    await expect(page.locator('.ayo-notes')).toHaveAttribute('aria-hidden', 'true')
    expect(await page.locator('.ayo-notes [aria-live], .ayo-notes [role="status"], .ayo-notes [role="alert"]').count()).toBe(0)
  })

  test('typography and colours come from the P1 system; the hero progress bar is unchanged', async ({ page }) => {
    await gotoFrame(page, 130)
    const styles = await page.evaluate(() => {
      const el = document.querySelector('[data-annotation="A4"]')!
      const g = (sel: string, prop: string) => getComputedStyle(el.querySelector(sel)!).getPropertyValue(prop)
      return {
        eyebrow: g('.ayo-note__eyebrow', 'font-family'),
        heading: g('.ayo-note__heading', 'font-family'),
        text: g('.ayo-note__text', 'font-family'),
        rule: g('.ayo-note__rule', 'background-color'),
        bar: getComputedStyle(document.querySelector('.ayo-hero__progress span')!).backgroundColor,
      }
    })
    expect(styles.eyebrow).toMatch(/Aboreto/i)
    expect(styles.heading).toMatch(/Cormorant/i)
    expect(styles.text).toMatch(/Jost/i)
    expect(styles.rule).toBe('rgb(226, 177, 60)') // approved gold on the new blocks
    expect(styles.bar).toBe('rgb(216, 185, 138)') // the hero's own gold, untouched
  })

  test('with reduced motion the blocks appear with opacity only', async ({ browser }, info) => {
    const context = await browser.newContext({ ...info.project.use, reducedMotion: 'reduce' })
    const page = await context.newPage()
    await page.goto('/')
    await expect(page.locator('canvas.ayo-hero__canvas')).toBeVisible()
    await gotoFrame(page, 122) // mid-entrance
    const t = await page.locator('[data-annotation="A4"] .ayo-note__heading').evaluate((el) => ({
      transform: el.style.transform,
      opacity: Number(el.style.opacity),
    }))
    expect(t.opacity).toBeGreaterThan(0)
    expect(t.opacity).toBeLessThan(1)
    expect(t.transform).toMatch(/translate3d\(0px, 0(\.00)?px, 0px\)|^$|none/)
    const rule = await page.locator('[data-annotation="A4"] .ayo-note__rule').evaluate((el) => el.style.transform)
    expect(rule).toBe('none')
    await context.close()
  })
})
