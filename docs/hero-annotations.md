# Hero annotations (Phase P2)

Eight editorial blocks over the 239-frame walkthrough, driven by the hero's
own published progress (see `hero-progress.md`). Files:

- `src/components/hero/annotations.ts` — copy, frame anchors, phase maths.
- `src/components/hero/HeroAnnotations.tsx` — the layer; subscribes to the
  progress store and writes styles to the DOM.
- `src/components/hero/HeroAnnotations.css` — anatomy, positions, tones,
  tablet and mobile rules.

## Timing

Visibility is a pure function of the displayed frame (`shownP × 238 + 1`),
not of time, so manual scrolling in either direction and any future autoplay
produce identical states.

| ID | Entry | Focal | Exit | Entrance (rule starts → done) | Exit (starts → gone) |
|---|---|---|---|---|---|
| A1 | 15 | 20 | 26 | 15 → 18 | 24 → 26 |
| A2 | 38 | 48 | 60 | 38 → 43 (design) | 57 → 60 (design) |
| A3 | 92 | 100 | 110 | 92 → 97 | 107 → 110 |
| A4 | 120 | 130 | 142 | 120 → 125 (design) | 139 → 142 (design) |
| A5 | 148 | 154 | 164 | 148 → 152 (design) | 161 → 164 (design) |
| A6 | 176 | 182 | 189 | 176 → 181 | 186 → 189 |
| A7 | 207 | 220 | 230 | 207 → 212 (design) | 227 → 230 (design) |
| A8 | 231 | 236 | 239 | 231 → 235 | none: holds through the hero's release |

Motion values (the design's "05 Motion" section is not present in the
export; these are restrained editorial defaults, documented here):

- Entrance: each element fades 0 → 1 and rises 12 px → 0 with a Hermite
  smoothstep inside the entrance window; the gold rule draws `scaleX(0 → 1)`
  from the left. Stagger: rule and eyebrow start at `entry` and finish two
  frames before `inEnd`, the headline starts one frame later and finishes one
  frame before `inEnd`, the support starts two frames later and finishes at
  `inEnd`. Everything is therefore established by `inEnd`, at or before the
  focal frame.
- Hold: fully established from `inEnd` (at or before the focal frame) to the
  start of the exit.
- Exit: the whole block fades 1 → 0 together with a 6 px lift over the exit
  window.
- Reduced motion (`prefers-reduced-motion: reduce`, read live): opacity only;
  no rise, no lift, the rule is already drawn.

Never more than one block is visible (checked by a unit test across every
half frame). With the approved anchors, 134 frames carry some text and 105
stay completely clear; the design caption's "109 / 130" predates the approved
anchors.

## Layout

Desktop (≥ 1024 px): blocks are `clamp(280px, 30vw, 432px)` wide (4 of 12
columns at 1440), padding 20/24, radius 6, gaps 12 between eyebrow, rule,
headline and support; headline max 18 ch, support max 34 ch. Positions as
fractions of the 1440 grid: A2 right third vertically centred (col 8, 58.75 %);
A4/A6/A7 upper-right (col 8, top 14 %); A5 lower-left (col 2, 11.25 %, bottom
16 %); A3 left lower-middle (col 2, centre at 58 % height); A8 lower-centre
(bottom 14 %); A1 top-right caption (right margin 3.33 %, top 12 %, smaller
type). All stay ≥ 64 px above the progress bar and clear of the chandeliers,
which sit top-left in frames 118–239.

Tablet (768–1023 px): same positions; width `clamp(280px, 38vw, 400px)`;
right-side blocks are pinned to a 6 % right margin so they cannot leave the
viewport.

Mobile (< 768 px): one block, `left/right: 24px`, bottom-anchored
`12svh` above the viewport edge; A1 is `display: none`; the rule is 28 px.

Tones: light blocks use the off-white scrim gradient with ink headline and
slate eyebrow/support, gold rule. The one dark block (A5) has no scrim, ivory
type with the 14 px soft shadow and a gold eyebrow.

## Accessibility

The visual layer is `aria-hidden`; the eight messages are rendered once in a
visually hidden `<section aria-labelledby>` list. No live region, nothing
announced per frame. Text contrast: ink on scrim over white walls ≥ 7:1,
ivory on the dark deck ≥ 12:1, slate on scrim ≥ 6:1 (reference sheet).

## Layer mechanics

The layer is `position: fixed; inset: 0; pointer-events: none`, hidden while
the hero is not on screen (`active === false`). Once the sticky viewport has
released (scrollY beyond `trackStart + trackLength`), the layer translates
up by the overshoot so the final block leaves with the hero instead of
floating over the next section. It adds no scroll listener, no animation
loop and no timers; a `matchMedia` change listener re-renders if the motion
preference changes.
