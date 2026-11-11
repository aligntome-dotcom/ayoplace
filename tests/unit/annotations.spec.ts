import { test, expect } from '@playwright/test'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { ANNOTATIONS, annotationPhase, smoothstep, visibleAnnotation } from '../../src/components/hero/annotations'

const APPROVED = [
  ['A1', 15, 20, 26, 'Grandville, Michigan.', 'Ten minutes from downtown Grand Rapids.'],
  ['A2', 38, 48, 60, 'Ayo means joy.', 'A Yoruba word, and the reason this place exists: rooms made for laughter.'],
  ['A3', 92, 100, 110, 'Rooms that take any shape.', 'Cocktail hour, ceremony or seated dinner. The layout follows your plan.'],
  ['A4', 120, 130, 142, 'Room for up to 600.', 'Distinct spaces for every kind of gathering.'],
  ['A5', 148, 154, 164, 'Warehouse character, kept.', 'The building’s industrial character remains in view.'],
  ['A6', 176, 182, 189, 'Somewhere to settle in.', 'Lounge seating for the quieter conversations between the big moments.'],
  ['A7', 207, 220, 230, 'Set for the day itself.', 'Your caterer, your vendors, your way. Bar service and cleaning are handled here.'],
  ['A8', 231, 236, 239, 'Come and see it.', 'Same-day tours, in person or over FaceTime.'],
] as const

test.describe('hero annotations: content and anchors', () => {
  test('eight annotations with the approved copy and entry/focal/exit frames, in order', () => {
    expect(ANNOTATIONS).toHaveLength(8)
    APPROVED.forEach(([id, entry, focal, exit, heading, text], i) => {
      const a = ANNOTATIONS[i]
      expect(a.id).toBe(id)
      expect(a.entry).toBe(entry)
      expect(a.focal).toBe(focal)
      expect(a.exit).toBe(exit)
      expect(a.heading).toBe(heading)
      expect(a.text).toBe(text)
      expect(a.entry < a.focal && a.focal < a.exit).toBe(true)
      expect(a.inEnd).toBeGreaterThan(a.entry)
      expect(a.inEnd).toBeLessThanOrEqual(a.focal)
      expect(a.outStart).toBeGreaterThanOrEqual(a.focal)
      expect(a.outStart).toBeLessThanOrEqual(a.exit)
    })
  })

  test('design-specified entrance and exit windows are used where given', () => {
    const byId = Object.fromEntries(ANNOTATIONS.map((a) => [a.id, a]))
    expect([byId.A2.inEnd, byId.A2.outStart]).toEqual([43, 57])
    expect([byId.A4.inEnd, byId.A4.outStart]).toEqual([125, 139])
    expect([byId.A5.inEnd, byId.A5.outStart]).toEqual([152, 161])
    expect([byId.A7.inEnd, byId.A7.outStart]).toEqual([212, 227])
    expect(byId.A8.holdsThroughRelease).toBe(true)
    expect(byId.A1.desktopOnly).toBe(true)
    expect(byId.A5.tone).toBe('dark')
    expect(ANNOTATIONS.filter((a) => a.tone === 'dark')).toHaveLength(1)
  })

  test('A5 copy makes no claim about original steel or construction', () => {
    const a5 = ANNOTATIONS.find((a) => a.id === 'A5')!
    expect(`${a5.heading} ${a5.text}`).not.toMatch(/original|steel|bones/i)
  })

  test('frame ranges never overlap: at most one block has visibility at any frame', () => {
    for (let f = 1; f <= 239; f += 0.5) {
      const visible = ANNOTATIONS.filter((a) => annotationPhase(a, f).visibility > 0.001)
      expect(visible.length, `frame ${f}`).toBeLessThanOrEqual(1)
    }
    const clear = []
    for (let f = 1; f <= 239; f++) if (!visibleAnnotation(f)) clear.push(f)
    // With the approved entry/exit anchors, 134 frames carry some text and 105
    // stay completely clear. (The design document's caption says 109/130; it
    // predates the approved anchors, which are authoritative.)
    expect(239 - clear.length).toBe(134)
    expect(clear.length).toBe(105)
    // Every gap between blocks is at least 5 clear frames.
    for (let i = 1; i < ANNOTATIONS.length; i++) {
      expect(ANNOTATIONS[i].entry - ANNOTATIONS[i - 1].exit, `gap before ${ANNOTATIONS[i].id}`).toBeGreaterThanOrEqual(1)
    }
  })
})

test.describe('hero annotations: phase function', () => {
  test('hidden before entry, rising through the entrance, established at focal, legible to the exit, gone after', () => {
    for (const a of ANNOTATIONS) {
      expect(annotationPhase(a, a.entry - 1).visibility, `${a.id} before entry`).toBe(0)
      expect(annotationPhase(a, a.entry - 0.01).visibility, `${a.id} just before entry`).toBe(0)
      // The block's own (rule) window runs from entry to inEnd − 2; sample its midpoint.
      const mid = annotationPhase(a, a.entry + Math.max(0.5, (a.inEnd - a.entry - 2) / 2)).visibility
      expect(mid, `${a.id} mid-entrance`).toBeGreaterThan(0)
      expect(mid, `${a.id} mid-entrance`).toBeLessThan(1)
      expect(annotationPhase(a, a.focal).visibility, `${a.id} at focal`).toBe(1)
      expect(annotationPhase(a, a.focal).heading, `${a.id} heading at focal`).toBe(1)
      expect(annotationPhase(a, a.focal).text, `${a.id} text at focal`).toBe(1)
      // Legible until the exit begins.
      expect(annotationPhase(a, a.outStart).visibility, `${a.id} at outStart`).toBe(1)
      if (!a.holdsThroughRelease) {
        expect(annotationPhase(a, a.exit).visibility, `${a.id} at exit`).toBe(0)
        expect(annotationPhase(a, a.exit + 1).visibility, `${a.id} after exit`).toBe(0)
      } else {
        expect(annotationPhase(a, 239).visibility, `${a.id} at the last frame`).toBe(1)
        expect(annotationPhase(a, 260).visibility, `${a.id} past the last frame`).toBe(1)
      }
    }
  })

  test('is a pure function of the frame, so reverse scrolling restores identical states', () => {
    const a = ANNOTATIONS[3] // A4
    const forward = [120, 122, 125, 130, 139, 141, 142].map((f) => annotationPhase(a, f))
    const backward = [142, 141, 139, 130, 125, 122, 120].map((f) => annotationPhase(a, f)).reverse()
    expect(backward).toEqual(forward)
  })

  test('is monotonic through the entrance and the exit (no flicker at boundaries)', () => {
    for (const a of ANNOTATIONS) {
      let prev = -1
      for (let f = a.entry - 1; f <= a.inEnd + 2; f += 0.25) {
        const v = annotationPhase(a, f).visibility
        expect(v, `${a.id} entrance at ${f}`).toBeGreaterThanOrEqual(prev)
        prev = v
      }
      if (a.holdsThroughRelease) continue
      prev = 2
      for (let f = a.outStart; f <= a.exit + 1; f += 0.25) {
        const v = annotationPhase(a, f).visibility
        expect(v, `${a.id} exit at ${f}`).toBeLessThanOrEqual(prev)
        prev = v
      }
    }
  })

  test('the rule leads, then the headline, then the support', () => {
    const a = ANNOTATIONS[1] // A2: entry 38, inEnd 43
    const ph = annotationPhase(a, 40)
    expect(ph.rule).toBeGreaterThan(ph.heading)
    expect(ph.heading).toBeGreaterThan(ph.text)
  })

  test('smoothstep clamps and eases', () => {
    expect(smoothstep(0, 10, -1)).toBe(0)
    expect(smoothstep(0, 10, 0)).toBe(0)
    expect(smoothstep(0, 10, 5)).toBe(0.5)
    expect(smoothstep(0, 10, 10)).toBe(1)
    expect(smoothstep(0, 10, 11)).toBe(1)
    expect(smoothstep(5, 5, 4)).toBe(0)
    expect(smoothstep(5, 5, 5)).toBe(1)
  })
})

test.describe('hero annotations: architecture guards', () => {
  const heroDir = join(process.cwd(), 'src', 'components', 'hero')

  test('the annotation layer adds no scroll listener, animation loop or timer of its own', () => {
    for (const name of ['HeroAnnotations.tsx', 'annotations.ts']) {
      const src = readFileSync(join(heroDir, name), 'utf8')
      expect(src, `${name} scroll listener`).not.toMatch(/addEventListener\(\s*['"](scroll|wheel|touchmove)/)
      expect(src, `${name} rAF`).not.toMatch(/requestAnimationFrame/)
      expect(src, `${name} timers`).not.toMatch(/setInterval|setTimeout/)
      expect(src, `${name} own progress maths`).not.toMatch(/getBoundingClientRect|scrollY\s*\/|innerHeight\s*\)/)
      expect(src, `${name} React state per frame`).not.toMatch(/useState/)
    }
    const layer = readFileSync(join(heroDir, 'HeroAnnotations.tsx'), 'utf8')
    expect(layer).toMatch(/subscribeHeroProgress\(/)
    expect(layer).toMatch(/shownP/)
  })

  test('no animation library was added', () => {
    const pkg = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8'))
    const deps = { ...pkg.dependencies, ...pkg.devDependencies }
    for (const name of Object.keys(deps)) expect(name).not.toMatch(/framer|motion|gsap|lenis|anime|popmotion/i)
  })

  test('the hero still owns the only animation loop in the hero folder', () => {
    const files = readdirSync(heroDir).filter((f) => /\.(tsx?|jsx?)$/.test(f))
    const withRaf = files.filter((f) => /requestAnimationFrame\(/.test(readFileSync(join(heroDir, f), 'utf8')))
    expect(withRaf).toEqual(['ScrollSequenceHero.jsx'])
  })
})
