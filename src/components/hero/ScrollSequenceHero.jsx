'use client'

import { useEffect, useRef } from 'react'
import './ScrollSequenceHero.css'

const FRAME_COUNT = 239
// Fraction of the sequence over which the hero copy fades and recedes.
// 0.14 is roughly the first 60vh of scrolling on desktop.
const TEXT_FADE_END = 0.14
// Scroll distance that drives the whole sequence, in viewport heights.
// Longer is calmer: the same wheel speed advances fewer frames per second,
// which keeps the decoder ahead of the scroll on modest hardware.
const SCROLL_VH_DESKTOP = 5.5
const SCROLL_VH_MOBILE = 4
// Scrub inertia. The drawn frame position chases the scroll position with a
// time constant of SMOOTH_TAU seconds (frame-rate independent), so a wheel
// notch becomes a short glide instead of a jump, and it never advances more
// than MAX_STEP frames per animation frame (still 7x the walkthrough's native
// 24 fps), so every flick plays at the same, readable top speed. While
// gliding it also waits, up to STALL_TICKS, for the next frame to be decoded
// at full size rather than showing a half-size keyframe.
const SMOOTH_TAU = 0.12
const MAX_STEP = 3
const STALL_TICKS = 4

// Frames are 1920x1080 JPEG (~19 MB for the set). JPEG rather than AVIF
// because decode speed is what limits scrubbing: a 1080p JPEG decodes 2-3x
// faster than the same frame as AVIF, and the set streams in coarse-to-fine
// so the hero is usable long before the download completes.
//
// Decoding a 1080p frame still takes tens of milliseconds, far more than one
// animation frame, so frames are never decoded on the hot path. The encoded
// bytes for every frame are kept in memory, and decoding happens off the main
// thread with createImageBitmap:
//   - a sliding window of full-size frames around the current scroll position
//     (bounded by a memory budget), and
//   - every KEY_STEP-th frame at half size, kept for the whole session so a
//     fast scrub always has a nearby picture while the window catches up.
const KEY_STEP = 8
// Concurrent decodes: enough to use spare cores, never so many that the
// main thread starves: one decoder per physical core, assuming two threads
// per core, so the UI thread and compositor keep a core to themselves.
// Memory for the full-size window. Decoded 1080p RGBA is ~8 MB per frame.
//
// Both depend on `navigator`, which does not exist while this module is
// evaluated on the server under Next.js, so they are read inside the effect
// (browser only) rather than at module scope. Values are unchanged.
function decodeLimits() {
  // One decoder per logical core but one, capped at 4: the main thread keeps
  // a core, and the glide is decode-bound on 4-core machines, so the extra
  // decoder is what keeps the picture sharp while it moves.
  const MAX_DECODES = Math.max(2, Math.min(4, (navigator.hardwareConcurrency || 4) - 1))
  const LOW_MEMORY = typeof navigator.deviceMemory === 'number' && navigator.deviceMemory <= 4
  const DECODE_BUDGET_BYTES = (LOW_MEMORY ? 64 : 128) * 1024 * 1024
  return { MAX_DECODES, DECODE_BUDGET_BYTES }
}

const framePath = (i) => `/frames/frame-${String(i + 1).padStart(3, '0')}.jpg`

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))
const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3)

const hasBitmap = typeof createImageBitmap === 'function'

// Decode a blob into something drawImage accepts: an ImageBitmap, optionally
// resized, or on browsers without createImageBitmap a decoded <img>.
async function decodeBlob(blob, size) {
  if (hasBitmap) {
    if (size) {
      try {
        return await createImageBitmap(blob, {
          resizeWidth: size.w,
          resizeHeight: size.h,
          resizeQuality: 'medium',
        })
      } catch {
        // Older engines reject the resize options; fall through to plain form.
      }
    }
    return createImageBitmap(blob)
  }
  const url = URL.createObjectURL(blob)
  try {
    const img = new Image()
    img.src = url
    await img.decode()
    return img
  } finally {
    URL.revokeObjectURL(url)
  }
}

const release = (x) => {
  if (x && typeof x.close === 'function') x.close()
}

export default function ScrollSequenceHero() {
  const sectionRef = useRef(null)
  const stickyRef = useRef(null)
  const canvasRef = useRef(null)
  const copyRef = useRef(null)
  const progressBarRef = useRef(null)
  const shadeRef = useRef(null)

  useEffect(() => {
    const { MAX_DECODES, DECODE_BUDGET_BYTES } = decodeLimits()
    const section = sectionRef.current
    const sticky = stickyRef.current
    const canvas = canvasRef.current
    const copy = copyRef.current
    const bar = progressBarRef.current
    const shade = shadeRef.current
    const ctx = canvas.getContext('2d', { alpha: false })

    // ---------- state ----------
    const blobs = new Array(FRAME_COUNT) // encoded bytes, all frames
    const full = new Array(FRAME_COUNT) // decoded full size, windowed
    const keys = new Array(FRAME_COUNT) // decoded half size, every KEY_STEP
    const pendingFull = new Set()
    const pendingKey = new Set()
    let inflight = 0
    let keySize = null // half of the natural frame size
    let span = 6 // half-width of the full-size window, in frames
    let keep = 8 // frames beyond which full-size decodes are evicted
    let targetFrame = 0
    let direction = 1
    let cancelled = false
    let dirty = true

    // ---------- fetching ----------
    const fetchFrame = async (i) => {
      try {
        const res = await fetch(framePath(i))
        if (!res.ok) return false
        const blob = await res.blob()
        if (cancelled) return false
        blobs[i] = blob
        return true
      } catch {
        return false
      }
    }

    // Probe the first frame for its size, which sets the memory window.
    const probe = async () => {
      if (!(await fetchFrame(0))) return false
      try {
        const bmp = await decodeBlob(blobs[0])
        const w = bmp.width || bmp.naturalWidth
        const h = bmp.height || bmp.naturalHeight
        release(bmp)
        keySize = { w: Math.max(1, Math.round(w / 2)), h: Math.max(1, Math.round(h / 2)) }
        const bytesPerFrame = w * h * 4
        span = clamp(Math.floor(DECODE_BUDGET_BYTES / bytesPerFrame / 2) - 2, 3, 16)
        keep = span + 2
        return true
      } catch {
        return false
      }
    }

    // First frame as soon as possible, then stream the rest in coarse-to-fine
    // order so early scrubbing shows approximately the right picture.
    const loadAll = async () => {
      if (!(await probe()) || cancelled) return
      pump()

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
          await fetchFrame(order[cursor++])
          pump()
        }
      }
      await Promise.all(Array.from({ length: CONCURRENCY }, worker))
    }

    // ---------- canvas sizing ----------
    let cssW = 1
    let cssH = 1
    let lastDrawn = -1
    let lastSharp = false

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
      // Bitmaps are drawn at close to 1:1; plain bilinear is visually identical
      // to the higher settings here and avoids per-texture mipmap work.
      ctx.imageSmoothingQuality = 'low'
      lastDrawn = -1
      dirty = true
    }
    const ro = new ResizeObserver(resize)
    ro.observe(sticky)
    resize()

    // ---------- decode scheduling ----------
    const nextJob = () => {
      const t = targetFrame
      // Full-size frames: the current one, then everything ahead in the
      // scroll direction in order, then behind. Frames behind have already
      // been shown, so spending decode time there while moving is wasted.
      // Ahead is strictly sequential because the glide (see tick) advances
      // onto the next decoded frame: the nearest frames are the ones needed
      // first, and the speed cap means the window stays ahead of the picture.
      const wanted = (i) => i >= 0 && i < FRAME_COUNT && blobs[i] && !full[i] && !pendingFull.has(i)
      if (wanted(t)) return { i: t, kind: 'full' }
      for (let d = 1; d <= span; d++) {
        const i = t + direction * d
        if (wanted(i)) return { i, kind: 'full' }
      }
      for (let d = 1; d <= span; d++) if (wanted(t - direction * d)) return { i: t - direction * d, kind: 'full' }
      // Then the permanent half-size keyframes.
      for (let i = 0; i < FRAME_COUNT; i += KEY_STEP) {
        if (blobs[i] && !keys[i] && !pendingKey.has(i)) return { i, kind: 'key' }
      }
      return null
    }

    const runJob = async ({ i, kind }) => {
      const pending = kind === 'full' ? pendingFull : pendingKey
      pending.add(i)
      inflight++
      try {
        const bmp = await decodeBlob(blobs[i], kind === 'key' ? keySize : null)
        if (cancelled) {
          release(bmp)
        } else {
          ;(kind === 'full' ? full : keys)[i] = bmp
          dirty = true
        }
      } catch {
        // Leave it undecoded; a neighbour will be drawn instead.
      } finally {
        pending.delete(i)
        inflight--
        if (!cancelled) pump()
      }
    }

    const pump = () => {
      if (cancelled || !keySize) return
      while (inflight < MAX_DECODES) {
        const job = nextJob()
        if (!job) return
        runJob(job)
      }
    }

    // Free full-size frames that have drifted out of the window.
    const evict = () => {
      for (let i = 0; i < FRAME_COUNT; i++) {
        if (full[i] && Math.abs(i - targetFrame) > keep) {
          release(full[i])
          full[i] = undefined
        }
      }
    }

    // Best available picture for frame t: exact, a sharp neighbour, the
    // nearest half-size keyframe, or failing that anything at all.
    const pick = (t) => {
      if (full[t]) return [full[t], t, true]
      for (let d = 1; d <= 3; d++) {
        if (t - d >= 0 && full[t - d]) return [full[t - d], t - d, true]
        if (t + d < FRAME_COUNT && full[t + d]) return [full[t + d], t + d, true]
      }
      const lo = Math.floor(t / KEY_STEP) * KEY_STEP
      const hi = lo + KEY_STEP
      const near = [lo, hi]
        .filter((k) => k < FRAME_COUNT && keys[k])
        .sort((a, b) => Math.abs(a - t) - Math.abs(b - t))
      if (near.length) return [keys[near[0]], near[0], false]
      for (let d = 1; d < FRAME_COUNT; d++) {
        for (const i of [t - d, t + d]) {
          if (i < 0 || i >= FRAME_COUNT) continue
          if (full[i]) return [full[i], i, true]
          if (keys[i]) return [keys[i], i, false]
        }
      }
      return null
    }

    // Draw with object-fit: cover semantics, centred.
    const draw = (img, i, sharp) => {
      const iw = img.width || img.naturalWidth
      const ih = img.height || img.naturalHeight
      const scale = Math.max(cssW / iw, cssH / ih)
      const dw = iw * scale
      const dh = ih * scale
      ctx.drawImage(img, (cssW - dw) / 2, (cssH - dh) / 2, dw, dh)
      canvas.dataset.frame = String(i + 1)
      canvas.dataset.sharp = sharp ? '1' : '0'
      lastDrawn = i
      lastSharp = sharp
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

    let lastTime = 0
    let stalled = 0

    const tick = (now) => {
      rafId = requestAnimationFrame(tick)
      const p = getProgress()
      const target = p * (FRAME_COUNT - 1)

      // Inertia: chase the scroll position with a fixed time constant so the
      // glide feels the same at 60 and 120 Hz, capped to MAX_STEP frames per
      // tick so a flick glides through sharp frames instead of skipping.
      const dt = lastTime ? Math.min(0.05, (now - lastTime) / 1000) : 1 / 60
      lastTime = now
      const delta = target - current
      if (Math.abs(delta) < 0.05) {
        current = target
        stalled = 0
      } else {
        const k = 1 - Math.exp(-dt / SMOOTH_TAU)
        let next = current + clamp(delta * k, -MAX_STEP, MAX_STEP)
        // Glide onto frames that are decoded at full size. If the frame we
        // would land on is not ready, advance only to the last ready one in
        // that direction, or hold for up to STALL_TICKS so the decoder (which
        // works sequentially ahead in the direction of travel) can catch up.
        // After that the picture follows the scroll regardless, so it can
        // never fall far behind on slow hardware.
        const dir = delta > 0 ? 1 : -1
        const from = Math.round(current)
        const to = Math.round(next)
        if (to !== from && !full[to] && stalled < STALL_TICKS) {
          let ready = from
          for (let i = from + dir; dir > 0 ? i <= to : i >= to; i += dir) {
            if (!full[i]) break
            ready = i
          }
          if (ready === from) {
            stalled++
            next = current
          } else {
            stalled = 0
            next = ready
          }
        } else {
          stalled = 0
        }
        current = next
      }

      applyCopy(p)
      if (bar) bar.style.transform = `scaleX(${p})`

      const t = Math.round(current)
      if (t !== targetFrame) {
        direction = t > targetFrame ? 1 : -1
        targetFrame = t
        evict()
        pump()
      }
      const choice = pick(t)
      if (choice && (choice[1] !== lastDrawn || choice[2] !== lastSharp || dirty)) {
        draw(choice[0], choice[1], choice[2])
        dirty = false
      }
    }
    rafId = requestAnimationFrame(tick)
    loadAll()

    return () => {
      cancelled = true
      cancelAnimationFrame(rafId)
      ro.disconnect()
      for (let i = 0; i < FRAME_COUNT; i++) {
        release(full[i])
        release(keys[i])
      }
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
