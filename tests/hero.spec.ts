import { test, expect, type Page } from '@playwright/test'

const FRAME_COUNT = 239
const TEXT_FADE_END = 0.14
const expectedFrame = (p: number) => Math.round(p * (FRAME_COUNT - 1)) + 1

// Scroll the hero to progress p (0..1) and wait until the canvas shows the
// exact frame, decoded at full size. Scroll positions are whole pixels, so the
// progress actually reached can differ from p by a fraction of a percent; the
// expected frame is derived from the reached progress, as the component does.
async function scrollToProgress(page: Page, p: number) {
  const reached = await page.evaluate((p) => {
    const section = document.querySelector('.ayo-hero')!
    const total = section.getBoundingClientRect().height - window.innerHeight
    const y = Math.round(total * p)
    window.scrollTo(0, y)
    return y / total
  }, p)
  const expected = expectedFrame(reached)
  await expect
    .poll(
      () => page.evaluate(() => {
        const c = document.querySelector('canvas') as HTMLCanvasElement
        return `${c.dataset.frame}/${c.dataset.sharp}`
      }),
      { timeout: 20_000 },
    )
    .toBe(`${expected}/1`)
  // Let the copy fade and progress bar settle (they lag the smoothed frame).
  await page.waitForTimeout(300)
  return { expected, reached }
}

const scaleX = (t: string) => Number(/scaleX\(([\d.]+)\)/.exec(t)?.[1] ?? NaN)

async function copyState(page: Page) {
  return page.evaluate(() => {
    const copy = document.querySelector('.ayo-hero__copy') as HTMLElement
    const bar = document.querySelector('.ayo-hero__progress span') as HTMLElement
    return {
      opacity: copy.style.opacity,
      transform: copy.style.transform,
      visibility: getComputedStyle(copy).visibility,
      bar: bar.style.transform,
    }
  })
}

test.describe('hero', () => {
  let errors: string[]

  test.beforeEach(async ({ page }) => {
    errors = []
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(`console: ${m.text()}`)
    })
  })

  test('server-renders the hero markup without errors', async ({ request }) => {
    const res = await request.get('/')
    expect(res.status()).toBe(200)
    const html = await res.text()
    expect(html).toContain('ayo-hero')
    expect(html).toContain('<canvas')
    expect(html).toContain('Discover the perfect setting')
    expect(html).toContain('href="#book"')
    expect(html).toContain('id="book"')
    expect(html).toContain('/frames/frame-001.jpg')
  })

  test('all 239 frames are served as immutable JPEGs', async ({ request }) => {
    for (let i = 1; i <= FRAME_COUNT; i++) {
      const name = `frame-${String(i).padStart(3, '0')}.jpg`
      const res = await request.head(`/frames/${name}`)
      expect(res.status(), name).toBe(200)
      expect(res.headers()['content-type'], name).toContain('image/jpeg')
      expect(res.headers()['cache-control'], name).toContain('immutable')
    }
  })

  test('scroll position maps to frames, forwards and in reverse', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('canvas.ayo-hero__canvas')).toBeVisible()

    // Canvas is sized to the viewport.
    const size = await page.evaluate(() => {
      const c = document.querySelector('canvas') as HTMLCanvasElement
      return { css: [c.clientWidth, c.clientHeight], px: [c.width, c.height], dpr: devicePixelRatio }
    })
    expect(size.css).toEqual([page.viewportSize()!.width, page.viewportSize()!.height])
    expect(size.px[0]).toBe(Math.round(size.css[0] * Math.min(size.dpr, 2)))

    // Initial position: first frame, copy fully visible, bar at zero.
    await scrollToProgress(page, 0)
    let s = await copyState(page)
    expect(s.opacity === '' || s.opacity === '1').toBeTruthy()
    expect(s.visibility).toBe('visible')
    expect(s.bar === '' || s.bar === 'scaleX(0)').toBeTruthy()

    // Forward stops.
    const forward: number[] = []
    for (const p of [0.04, 0.1, 0.2, 0.5, 0.8, 1]) {
      const { expected, reached } = await scrollToProgress(page, p)
      forward.push(expected)
      s = await copyState(page)
      if (reached >= TEXT_FADE_END) {
        expect(s.opacity, `copy hidden at ${p}`).toBe('0')
        expect(s.visibility).toBe('hidden')
      } else {
        const o = Number(s.opacity)
        expect(o, `copy fading at ${p}`).toBeGreaterThan(0)
        expect(o).toBeLessThan(1)
        expect(s.transform).toMatch(/translate3d\(0px?, -?[\d.]+vh, [\d.]+px\)/)
      }
      expect(Math.abs(scaleX(s.bar) - reached), `progress bar at ${p}`).toBeLessThan(0.002)
    }
    // Frame numbers rise monotonically and end on the last frame.
    expect(forward.every((f, i) => i === 0 || f > forward[i - 1])).toBeTruthy()
    expect(forward.at(-1)).toBe(FRAME_COUNT)

    // Reverse: scrolling up walks the sequence backwards to the first frame.
    const back: number[] = []
    for (const p of [0.8, 0.5, 0.2, 0.04, 0]) back.push((await scrollToProgress(page, p)).expected)
    expect(back.every((f, i) => i === 0 || f < back[i - 1])).toBeTruthy()
    expect(back.at(-1)).toBe(1)
    s = await copyState(page)
    expect(s.visibility).toBe('visible')

    expect(errors, errors.join('\n')).toEqual([])
  })

  test('the call to action reaches the placeholder section', async ({ page }) => {
    await page.goto('/')
    const cta = page.locator('a.ayo-hero__cta')
    await expect(cta).toHaveAttribute('href', '#book')
    await cta.focus()
    await expect(cta).toBeFocused()
    await page.keyboard.press('Enter')
    await expect.poll(() => page.evaluate(() => location.hash)).toBe('#book')
    await expect(page.locator('#book')).toBeVisible()
    expect(errors, errors.join('\n')).toEqual([])
  })
})
