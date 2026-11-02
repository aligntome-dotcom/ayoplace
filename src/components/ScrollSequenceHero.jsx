import { useEffect, useRef } from 'react'
import './ScrollSequenceHero.css'

const FRAME_COUNT = 300
// Fraction of the sequence over which the hero copy fades and recedes.
// 0.14 is roughly the first 60vh of scrolling on desktop.
const TEXT_FADE_END = 0.14
// Scroll distance that drives the whole sequence, in viewport heights.
const SCROLL_VH_DESKTOP = 4.5
const SCROLL_VH_MOBILE = 3.5

const framePath = (i) =>
  `${import.meta.env.BASE_URL}frames/frame-${String(i + 1).padStart(3, '0')}.jpg`

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))
const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3)

export default function ScrollSequenceHero() {
  const sectionRef = useRef(null)
  const stickyRef = useRef(null)
  const canvasRef = useRef(null)
  const copyRef = useRef(null)
  const progressBarRef = useRef(null)
  const shadeRef = useRef(null)

  useEffect(() => {
    const section = sectionRef.current
    const sticky = stickyRef.current
    const canvas = canvasRef.current
    const copy = copyRef.current
    const bar = progressBarRef.current
    const shade = shadeRef.current
    const ctx = canvas.getContext('2d', { alpha: false })

    // ---------- frame loading ----------
    const images = new Array(FRAME_COUNT)
    const loaded = new Array(FRAME_COUNT).fill(false)
    let cancelled = false
    let dirty = true

    const loadFrame = (i) =>
      new Promise((resolve) => {
        const img = new Image()
        img.decoding = 'async'
        img.onload = () => {
          if (!cancelled) {
            images[i] = img
            loaded[i] = true
            dirty = true
          }
          resolve()
        }
        img.onerror = () => resolve()
        img.src = framePath(i)
      })

    // Paint the first frame as soon as it arrives, then stream the rest in.
    // A coarse pass (every 10th frame) comes first so early scrubbing shows
    // approximately the right picture, then the gaps are filled in.
    const loadAll = async () => {
      await loadFrame(0)
      const seen = new Set([0])
      const order = []
      for (const step of [10, 5, 2, 1]) {
        for (let i = 0; i < FRAME_COUNT; i += step) {
          if (!seen.has(i)) {
            seen.add(i)
            order.push(i)
          }
        }
      }
      const CONCURRENCY = 6
      let cursor = 0
      const worker = async () => {
        while (cursor < order.length && !cancelled) {
          await loadFrame(order[cursor++])
        }
      }
      await Promise.all(Array.from({ length: CONCURRENCY }, worker))
    }
    loadAll()

    // Nearest frame that has actually loaded, searching outward from target.
    const nearestLoaded = (target) => {
      if (loaded[target]) return target
      for (let d = 1; d < FRAME_COUNT; d++) {
        if (target - d >= 0 && loaded[target - d]) return target - d
        if (target + d < FRAME_COUNT && loaded[target + d]) return target + d
      }
      return -1
    }

    // ---------- canvas sizing ----------
    let cssW = 1
    let cssH = 1
    let lastDrawn = -1

    const resize = () => {
      const rect = sticky.getBoundingClientRect()
      cssW = Math.max(1, Math.round(rect.width))
      cssH = Math.max(1, Math.round(rect.height))
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = Math.round(cssW * dpr)
      canvas.height = Math.round(cssH * dpr)
      canvas.style.width = `${cssW}px`
      canvas.style.height = `${cssH}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = 'high'
      lastDrawn = -1
      dirty = true
    }
    const ro = new ResizeObserver(resize)
    ro.observe(sticky)
    resize()

    // Draw with object-fit: cover semantics, centred.
    const drawFrame = (i) => {
      const img = images[i]
      if (!img) return
      const iw = img.naturalWidth
      const ih = img.naturalHeight
      const scale = Math.max(cssW / iw, cssH / ih)
      const dw = iw * scale
      const dh = ih * scale
      ctx.drawImage(img, (cssW - dw) / 2, (cssH - dh) / 2, dw, dh)
    }

    // ---------- scroll -> frame ----------
    let current = 0 // smoothed frame position
    let lastCopyBucket = -1
    let rafId = 0

    const getProgress = () => {
      const rect = section.getBoundingClientRect()
      const total = rect.height - window.innerHeight
      if (total <= 0) return 0
      return clamp(-rect.top / total, 0, 1)
    }

    // Fade the hero copy and push it away along Z the moment scrolling starts.
    const applyCopy = (p) => {
      const e = easeOutCubic(clamp(p / TEXT_FADE_END, 0, 1))
      const bucket = Math.round(e * 200)
      if (bucket === lastCopyBucket) return
      lastCopyBucket = bucket
      copy.style.opacity = String(1 - e)
      copy.style.transform = `translate3d(0, ${-e * 6}vh, ${e * 520}px)`
      copy.style.filter = e > 0 ? `blur(${(e * 6).toFixed(2)}px)` : 'none'
      copy.style.pointerEvents = e > 0.5 ? 'none' : 'auto'
      copy.style.visibility = e >= 1 ? 'hidden' : 'visible'
      // Let the vignette go with the copy so the walkthrough plays at full brightness.
      if (shade) shade.style.opacity = String(1 - e)
    }

    const tick = () => {
      rafId = requestAnimationFrame(tick)
      const p = getProgress()
      const target = p * (FRAME_COUNT - 1)

      // Light smoothing so mouse-wheel steps do not jump several frames at
      // once, but tight enough that it settles instantly when scrolling stops.
      const delta = target - current
      current = Math.abs(delta) < 0.05 ? target : current + delta * 0.35

      applyCopy(p)
      if (bar) bar.style.transform = `scaleX(${p})`

      const want = nearestLoaded(Math.round(current))
      if (want >= 0 && (want !== lastDrawn || dirty)) {
        drawFrame(want)
        lastDrawn = want
        dirty = false
      }
    }
    rafId = requestAnimationFrame(tick)

    return () => {
      cancelled = true
      cancelAnimationFrame(rafId)
      ro.disconnect()
    }
  }, [])

  return (
    <section
      ref={sectionRef}
      className="ayo-hero"
      style={{
        '--scroll-vh-desktop': SCROLL_VH_DESKTOP,
        '--scroll-vh-mobile': SCROLL_VH_MOBILE,
      }}
      aria-label="The Ayo Place venue walkthrough"
    >
      <div ref={stickyRef} className="ayo-hero__sticky">
        <canvas ref={canvasRef} className="ayo-hero__canvas" aria-hidden="true" />

        {/* Soft vignette so white copy reads over the bright exterior frames. */}
        <div ref={shadeRef} className="ayo-hero__shade" aria-hidden="true" />

        <div className="ayo-hero__stage">
          <div ref={copyRef} className="ayo-hero__copy">
            <h1 className="ayo-hero__title">
              Discover the perfect setting for your celebration at The Ayo Place
            </h1>
            <p className="ayo-hero__lede">
              A modern, light-filled event space for weddings, parties and gatherings.
              Scroll to walk through and picture your day here.
            </p>
            <a href="#book" className="ayo-hero__cta">
              Book today
            </a>
          </div>
        </div>

        <div className="ayo-hero__progress" aria-hidden="true">
          <span ref={progressBarRef} />
        </div>
      </div>
    </section>
  )
}
