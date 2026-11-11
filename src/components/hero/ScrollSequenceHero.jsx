'use client'

import { useEffect, useRef } from 'react'
import { publishHeroProgress, resetHeroProgress } from './heroProgress'
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
// When the next frame has not even been downloaded yet (first visit over a
// slow connection), the glide may wait a little longer for it, then moves on
// with the best picture available so it never freezes.
const NET_STALL_TICKS = 18
// Download scheduling: frames just ahead of the current position in the
// direction of travel are fetched first, then a few behind, then the rest
// coarse-to-fine so a far jump still finds a nearby picture.
const FETCH_AHEAD = 24
const FETCH_BEHIND = 6
const FETCH_CONCURRENCY = 8
// Two copies of every frame are served: the 1920x1080 originals in
// /frames and 960x540 copies (about a quarter of the bytes) in /frames-sm.
// The small set streams first so the walkthrough moves within a second or
// two on a normal connection; the originals follow and sharpen the picture.
// Small frames are decoded for a window of KEY_SPAN frames around the
// position, plus every KEY_STEP-th frame permanently.
const FULL_AHEAD = 12
const KEY_SPAN = 24

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
const smallPath = (i) => `/frames-sm/frame-${String(i + 1).padStart(3, '0')}.jpg`

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
    const blobs = new Array(FRAME_COUNT) // encoded full-size bytes
    const smalls = new Array(FRAME_COUNT) // encoded small (960x540) bytes
    const full = new Array(FRAME_COUNT) // decoded full size, windowed
    const keys = new Array(FRAME_COUNT) // decoded small size: windowed, plus every KEY_STEP-th kept
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
    const pendingFetch = new Set() // keys like 'f12' / 's12'
    const fetchFailures = new Map()
    const fetchFrame = async (i, tier = 'full', near = false) => {
      try {
        // Priority hints are honoured by Chromium and ignored elsewhere.
        const res = await fetch(tier === 'small' ? smallPath(i) : framePath(i), { priority: near ? 'high' : 'low' })
        if (!res.ok) return false
        const blob = await res.blob()
        if (cancelled) return false
        ;(tier === 'small' ? smalls : blobs)[i] = blob
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

    // First frame as soon as possible, then stream the rest. The download
    // order is decided per request: frames just ahead of the current position
    // first (they are the ones about to be shown), a few behind, then the rest
    // coarse-to-fine so a far jump still shows approximately the right picture.
    const coarse = []
    {
      const seen = new Set([0])
      for (const step of [10, 5, 2, 1]) {
        for (let i = 0; i < FRAME_COUNT; i += step) {
          if (!seen.has(i)) {
            seen.add(i)
            coarse.push(i)
          }
        }
      }
    }
    const cursors = { small: 0, full: 0 }

    const fetchKey = (tier, i) => `${tier[0]}${i}`
    const have = (tier, i) => (tier === 'small' ? smalls : blobs)[i]
    const wantFetch = (tier, i) =>
      i >= 0 &&
      i < FRAME_COUNT &&
      !have(tier, i) &&
      !pendingFetch.has(fetchKey(tier, i)) &&
      (fetchFailures.get(fetchKey(tier, i)) || 0) < 3

    const nextFetch = () => {
      const t = targetFrame
      // 1. Small frames just ahead: cheapest way to keep the picture moving.
      for (let d = 0; d <= FETCH_AHEAD; d++) {
        const i = t + direction * d
        if (wantFetch('small', i)) return { i, tier: 'small', near: true }
      }
      // 2. Full-size frames just ahead: what makes the picture sharp.
      for (let d = 0; d <= FULL_AHEAD; d++) {
        const i = t + direction * d
        if (wantFetch('full', i)) return { i, tier: 'full', near: true }
      }
      for (let d = 1; d <= FETCH_BEHIND; d++) {
        const i = t - direction * d
        if (wantFetch('small', i)) return { i, tier: 'small', near: true }
      }
      // 3. Everything else, small set first, each coarse-to-fine.
      for (const tier of ['small', 'full']) {
        while (cursors[tier] < coarse.length) {
          const i = coarse[cursors[tier]]
          if (wantFetch(tier, i)) return { i, tier, near: false }
          if (have(tier, i) || (fetchFailures.get(fetchKey(tier, i)) || 0) >= 3) cursors[tier]++
          else break // in flight; another worker has it
        }
      }
      for (const tier of ['small', 'full']) {
        for (let i = 0; i < FRAME_COUNT; i++) if (wantFetch(tier, i)) return { i, tier, near: false }
      }
      return null
    }

    const loadAll = async () => {
      if (!(await probe()) || cancelled) return
      pump()

      const worker = async () => {
        while (!cancelled) {
          const job = nextFetch()
          if (!job) {
            // Nothing to start right now. If other fetches are still in
            // flight, wait briefly and look again; otherwise we are done.
            if (pendingFetch.size === 0) return
            await new Promise((r) => setTimeout(r, 50))
            continue
          }
          const key = fetchKey(job.tier, job.i)
          pendingFetch.add(key)
          const ok = await fetchFrame(job.i, job.tier, job.near)
          pendingFetch.delete(key)
          if (!ok) fetchFailures.set(key, (fetchFailures.get(key) || 0) + 1)
          pump()
        }
      }
      await Promise.all(Array.from({ length: FETCH_CONCURRENCY }, worker))
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
      // Small frames decode in a few milliseconds from the small set (or at
      // half size from a full blob when only that has arrived).
      const wantedKey = (i) =>
        i >= 0 && i < FRAME_COUNT && (smalls[i] || blobs[i]) && !keys[i] && !full[i] && !pendingKey.has(i)
      if (wanted(t)) return { i: t, kind: 'full' }
      if (wantedKey(t)) return { i: t, kind: 'key' }
      for (let d = 1; d <= span; d++) {
        const i = t + direction * d
        if (wanted(i)) return { i, kind: 'full' }
      }
      for (let d = 1; d <= KEY_SPAN; d++) {
        const i = t + direction * d
        if (wantedKey(i)) return { i, kind: 'key' }
      }
      for (let d = 1; d <= span; d++) if (wanted(t - direction * d)) return { i: t - direction * d, kind: 'full' }
      for (let d = 1; d <= FETCH_BEHIND; d++) if (wantedKey(t - direction * d)) return { i: t - direction * d, kind: 'key' }
      // Then the permanent small keyframes.
      for (let i = 0; i < FRAME_COUNT; i += KEY_STEP) {
        if ((smalls[i] || blobs[i]) && !keys[i] && !pendingKey.has(i)) return { i, kind: 'key' }
      }
      return null
    }

    const runJob = async ({ i, kind }) => {
      const pending = kind === 'full' ? pendingFull : pendingKey
      pending.add(i)
      inflight++
      try {
        const bmp =
          kind === 'key'
            ? smalls[i]
              ? await decodeBlob(smalls[i])
              : await decodeBlob(blobs[i], keySize)
            : await decodeBlob(blobs[i])
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

    // Free decoded frames that have drifted out of their windows. Every
    // KEY_STEP-th small frame is kept for the whole session.
    const evict = () => {
      for (let i = 0; i < FRAME_COUNT; i++) {
        const dist = Math.abs(i - targetFrame)
        if (full[i] && dist > keep) {
          release(full[i])
          full[i] = undefined
        }
        if (keys[i] && i % KEY_STEP !== 0 && dist > KEY_SPAN + 4) {
          release(keys[i])
          keys[i] = undefined
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
      // The small copy of this very frame, else the nearest small frame.
      if (keys[t]) return [keys[t], t, false]
      for (let d = 1; d <= KEY_STEP; d++) {
        if (t - d >= 0 && keys[t - d]) return [keys[t - d], t - d, false]
        if (t + d < FRAME_COUNT && keys[t + d]) return [keys[t + d], t + d, false]
      }
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

    // The last measured section rect and track length, kept for the progress
    // publication below so nothing is measured twice per frame.
    let lastRect = null
    let lastTotal = 0

    const getProgress = () => {
      const rect = section.getBoundingClientRect()
      const total = rect.height - window.innerHeight
      lastRect = rect
      lastTotal = total
      if (total <= 0) return 0
      return clamp(-rect.top / total, 0, 1)
    }

    // ---------- progress publication (for annotations / autoplay) ----------
    // Publishes the hero's own progress to subscribers (see heroProgress.ts)
    // only when something changed, so the page at rest costs nothing.
    let pubFrame = -1
    let pubP = -1
    let pubActive = null
    let pubStart = -1
    let pubLength = -1
    const publishIfChanged = (p, t) => {
      if (!lastRect) return
      const active = lastRect.bottom > 0 && lastRect.top < window.innerHeight
      const trackStart = Math.round(window.scrollY + lastRect.top)
      const trackLength = Math.max(0, Math.round(lastTotal))
      if (
        t === pubFrame &&
        active === pubActive &&
        trackStart === pubStart &&
        trackLength === pubLength &&
        Math.abs(p - pubP) <= 0.0005
      ) {
        return
      }
      pubFrame = t
      pubP = p
      pubActive = active
      pubStart = trackStart
      pubLength = trackLength
      publishHeroProgress({
        p,
        shownP: t / (FRAME_COUNT - 1),
        frame: t + 1,
        active,
        trackStart,
        trackLength,
      })
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
        // A frame is ready to be glided onto when either its full-size or
        // its small decode exists; the small one keeps the motion continuous
        // while the originals are still arriving, and the picture sharpens
        // as soon as the full frame lands.
        const isReady = (i) => full[i] || keys[i]
        const budget = blobs[to] || smalls[to] ? STALL_TICKS : NET_STALL_TICKS
        if (to !== from && !isReady(to) && stalled < budget) {
          let ready = from
          for (let i = from + dir; dir > 0 ? i <= to : i >= to; i += dir) {
            if (!isReady(i)) break
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
      publishIfChanged(p, t)
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
      resetHeroProgress()
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
