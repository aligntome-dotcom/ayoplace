import { test, expect } from '@playwright/test'
import {
  HERO_FRAME_COUNT,
  __resetHeroProgressForTests,
  frameToProgress,
  getHeroProgress,
  heroProgressListenerCount,
  progressToFrame,
  publishHeroProgress,
  resetHeroProgress,
  subscribeHeroProgress,
  type HeroProgress,
} from '../../src/components/hero/heroProgress'

const sample = (over: Partial<HeroProgress> = {}): HeroProgress => ({
  p: 0.5,
  shownP: 0.5,
  frame: 120,
  active: true,
  trackStart: 0,
  trackLength: 4050,
  ...over,
})

test.describe('hero progress store', () => {
  test.beforeEach(() => __resetHeroProgressForTests())

  test('starts inactive at frame 1 with zero progress', () => {
    expect(getHeroProgress()).toEqual({ p: 0, shownP: 0, frame: 1, active: false, trackStart: 0, trackLength: 0 })
  })

  test('frame and progress helpers agree with the hero mapping (p = (frame − 1) / 238)', () => {
    expect(HERO_FRAME_COUNT).toBe(239)
    expect(frameToProgress(1)).toBe(0)
    expect(frameToProgress(239)).toBe(1)
    expect(progressToFrame(0)).toBe(1)
    expect(progressToFrame(1)).toBe(239)
    expect(progressToFrame(frameToProgress(130))).toBe(130)
    expect(progressToFrame(-1)).toBe(1)
    expect(progressToFrame(2)).toBe(239)
  })

  test('subscribe delivers the current state immediately, then each publication', () => {
    const seen: HeroProgress[] = []
    const unsubscribe = subscribeHeroProgress((s) => seen.push(s))
    expect(seen).toHaveLength(1)
    expect(seen[0].active).toBe(false)
    publishHeroProgress(sample())
    publishHeroProgress(sample({ frame: 121, shownP: frameToProgress(121) }))
    expect(seen).toHaveLength(3)
    expect(seen[2].frame).toBe(121)
    unsubscribe()
    publishHeroProgress(sample({ frame: 122 }))
    expect(seen).toHaveLength(3)
    expect(heroProgressListenerCount()).toBe(0)
  })

  test('immediate: false skips the initial call', () => {
    let calls = 0
    const off = subscribeHeroProgress(() => calls++, { immediate: false })
    expect(calls).toBe(0)
    publishHeroProgress(sample())
    expect(calls).toBe(1)
    off()
  })

  test('reset keeps the last values but marks the hero inactive', () => {
    publishHeroProgress(sample({ frame: 200, p: 0.84, shownP: frameToProgress(200) }))
    resetHeroProgress()
    const s = getHeroProgress()
    expect(s.active).toBe(false)
    expect(s.frame).toBe(200)
    expect(s.p).toBe(0.84)
  })

  test('a throwing subscriber does not stop other subscribers or the publisher', () => {
    const seen: number[] = []
    subscribeHeroProgress(() => {
      throw new Error('boom')
    }, { immediate: false })
    subscribeHeroProgress((s) => seen.push(s.frame), { immediate: false })
    expect(() => publishHeroProgress(sample({ frame: 50 }))).not.toThrow()
    expect(seen).toEqual([50])
  })
})
