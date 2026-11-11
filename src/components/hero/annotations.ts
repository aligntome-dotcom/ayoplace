/**
 * Hero annotations (Phase P2): the eight editorial moments over the
 * 239-frame walkthrough, as data. Copy and frame anchors are the approved
 * ones (design document "The Ayo Place · Public Experience", pages 1, 2 and
 * 5–8). Visibility is a pure function of the displayed frame, so scrolling
 * backwards restores earlier states exactly and nothing depends on timers.
 *
 * Frames are 1-based like the files. `entry` is the first frame with any
 * visibility, `focal` the frame where the block is fully established, `exit`
 * the last frame with any visibility. `inEnd` / `outStart` are the ends of
 * the entrance and the start of the exit; where the design gives them
 * (A2, A4, A5, A7) they are its values, otherwise entry + 5 and exit − 3,
 * the same lengths the design uses.
 */

export type AnnotationTone = 'light' | 'dark'

export type AnnotationPosition =
  | 'top-right-caption' // A1
  | 'right-centre' // A2
  | 'left-lower-middle' // A3
  | 'upper-right' // A4, A6, A7
  | 'lower-left' // A5
  | 'lower-centre' // A8

export interface Annotation {
  id: 'A1' | 'A2' | 'A3' | 'A4' | 'A5' | 'A6' | 'A7' | 'A8'
  entry: number
  focal: number
  exit: number
  inEnd: number
  outStart: number
  /** True for the last block, which stays up through the release of the sticky hero. */
  holdsThroughRelease?: boolean
  eyebrow: string
  heading: string
  text: string
  tone: AnnotationTone
  position: AnnotationPosition
  /** A1 only: never rendered below the desktop breakpoint. */
  desktopOnly?: boolean
  /** A1 only: smaller caption styling. */
  caption?: boolean
}

export const ANNOTATIONS: readonly Annotation[] = [
  {
    id: 'A1',
    entry: 15,
    focal: 20,
    exit: 26,
    inEnd: 18,
    outStart: 24,
    eyebrow: 'Location',
    heading: 'Grandville, Michigan.',
    text: 'Ten minutes from downtown Grand Rapids.',
    tone: 'light',
    position: 'top-right-caption',
    desktopOnly: true,
    caption: true,
  },
  {
    id: 'A2',
    entry: 38,
    focal: 48,
    exit: 60,
    inEnd: 43,
    outStart: 57,
    eyebrow: 'The name',
    heading: 'Ayo means joy.',
    text: 'A Yoruba word, and the reason this place exists: rooms made for laughter.',
    tone: 'light',
    position: 'right-centre',
  },
  {
    id: 'A3',
    entry: 92,
    focal: 100,
    exit: 110,
    inEnd: 97,
    outStart: 107,
    eyebrow: 'Spaces',
    heading: 'Rooms that take any shape.',
    text: 'Cocktail hour, ceremony or seated dinner. The layout follows your plan.',
    tone: 'light',
    position: 'left-lower-middle',
  },
  {
    id: 'A4',
    entry: 120,
    focal: 130,
    exit: 142,
    inEnd: 125,
    outStart: 139,
    eyebrow: 'Capacity',
    heading: 'Room for up to 600.',
    text: 'Distinct spaces for every kind of gathering.',
    tone: 'light',
    position: 'upper-right',
  },
  {
    id: 'A5',
    entry: 148,
    focal: 154,
    exit: 164,
    inEnd: 152,
    outStart: 161,
    eyebrow: 'Character',
    heading: 'Warehouse character, kept.',
    text: 'The building’s industrial character remains in view.',
    tone: 'dark',
    position: 'lower-left',
  },
  {
    id: 'A6',
    entry: 176,
    focal: 182,
    exit: 189,
    inEnd: 181,
    outStart: 186,
    eyebrow: 'Lounge',
    heading: 'Somewhere to settle in.',
    text: 'Lounge seating for the quieter conversations between the big moments.',
    tone: 'light',
    position: 'upper-right',
  },
  {
    id: 'A7',
    entry: 207,
    focal: 220,
    exit: 230,
    inEnd: 212,
    outStart: 227,
    eyebrow: 'Services',
    heading: 'Set for the day itself.',
    text: 'Your caterer, your vendors, your way. Bar service and cleaning are handled here.',
    tone: 'light',
    position: 'upper-right',
  },
  {
    id: 'A8',
    entry: 231,
    focal: 236,
    exit: 239,
    inEnd: 235,
    outStart: 239,
    holdsThroughRelease: true,
    eyebrow: 'Visit',
    heading: 'Come and see it.',
    text: 'Same-day tours, in person or over FaceTime.',
    tone: 'light',
    position: 'lower-centre',
  },
]

/** Hermite smoothstep of x between edge0 and edge1 (0 below, 1 above). */
export function smoothstep(edge0: number, edge1: number, x: number): number {
  if (edge1 <= edge0) return x >= edge1 ? 1 : 0
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

export interface AnnotationPhase {
  /** 0..1 overall visibility of the block. */
  visibility: number
  /** 0..1 entrance progress of the gold rule, headline and support (staggered). */
  rule: number
  heading: number
  text: number
  /** 0..1 exit progress; 1 once the block has fully left. */
  out: number
}

/**
 * Visibility state of one annotation for a displayed frame position.
 * `frame` is 1-based and may be fractional. Pure, so it is reversible.
 *
 * Entrance: staggered inside the window [entry, inEnd]. The rule (and
 * eyebrow) start at `entry`, the headline one frame later, the support two
 * frames later, and all three are fully in by `inEnd`, which is never after
 * the focal frame. Exit: everything leaves together between `outStart` and
 * `exit`, except the last block, which never exits (it holds through the
 * hero's release).
 */
export function annotationPhase(a: Annotation, frame: number): AnnotationPhase {
  const inLength = Math.max(3, a.inEnd - a.entry)
  const rule = smoothstep(a.entry, a.entry + inLength - 2, frame)
  const heading = smoothstep(a.entry + 1, a.entry + inLength - 1, frame)
  const text = smoothstep(a.entry + 2, a.entry + inLength, frame)
  const out = a.holdsThroughRelease ? 0 : smoothstep(a.outStart, a.exit, frame)
  const visibility = frame < a.entry ? 0 : rule * (1 - out)
  return { visibility, rule, heading, text, out }
}

/** The annotation that has any visibility at this frame, if one does. */
export function visibleAnnotation(frame: number): Annotation | null {
  for (const a of ANNOTATIONS) {
    if (frame >= a.entry && (a.holdsThroughRelease || frame < a.exit)) return a
  }
  return null
}
