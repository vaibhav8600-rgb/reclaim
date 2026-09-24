/**
 * A small 2D figure rig for looping exercise demonstrations. Side view, facing right.
 *
 * Angles are absolute, in degrees: 0 points straight down, 90 forward (right), 180 up, -90 back (left).
 * Frames blend angles numerically, so write them on the side the limb travels (260 rather than -100 to go
 * over the head from 180).
 * A limb is driven either by angles or by a target point for its wrist/ankle (two-bone IK), so hands and feet
 * can stay planted on a table, wall or floor while the body moves. Frames are interpolated in that "spec" space
 * (targets are interpolated, then solved), so a planted foot never slides.
 */

export type Pt = { x: number; y: number }

/** Segment lengths, in viewBox units (a standing figure is ~150 tall). */
export const L = { torso: 46, neck: 6, headR: 9, upperArm: 25, forearm: 23, hand: 8, thigh: 38, shin: 36, foot: 12 }

export interface Spec {
  hipX: number
  hipY: number
  /** Torso angle (180 = upright), or aim it at a point (e.g. shoulders staying on the floor in a bridge). */
  torso?: number
  torsoAt?: [number, number]
  /** Rounds (<0) or sags (>0) the back, in units: cat–cow. */
  curve?: number
  head?: number
  /** Slides the head back (<0) along the neck's perpendicular: chin tucks. */
  headShift?: number
  // Arms (n = near side, f = far side): angles, or a wrist target plus bend direction.
  nUA?: number; nFA?: number; nArm?: [number, number]; nArmBend?: 1 | -1; nH?: number
  fUA?: number; fFA?: number; fArm?: [number, number]; fArmBend?: 1 | -1; fH?: number
  // Legs: angles, or an ankle target plus bend direction.
  nTH?: number; nSH?: number; nLeg?: [number, number]; nLegBend?: 1 | -1; nFT?: number
  fTH?: number; fSH?: number; fLeg?: [number, number]; fLegBend?: 1 | -1; fFT?: number
  /** 0–1: shown as a pulse on the highlighted segments (holds, squeezes). */
  effort?: number
  /** A free parameter for props (a band's stretch, a ball's squash…). */
  p?: number
}

export interface Frame {
  spec: Partial<Spec>
  /** ms to move here from the previous frame. */
  move: number
  /** ms to stay here. */
  hold?: number
  label?: string
}

export type Segment = 'torso' | 'head' | 'nUA' | 'nFA' | 'nH' | 'fUA' | 'fFA' | 'fH' | 'nTH' | 'nSH' | 'nFT' | 'fTH' | 'fSH' | 'fFT'

export interface Figure {
  hip: Pt
  shoulder: Pt
  neck: Pt
  head: Pt
  /** The way the face points. */
  face: number
  /** Control point of the back's curve. */
  back: Pt
  n: Side
  f: Side
}
interface Side {
  elbow: Pt
  wrist: Pt
  hand: Pt
  knee: Pt
  ankle: Pt
  toe: Pt
  heel: Pt
}

const rad = (a: number) => (a * Math.PI) / 180
const deg = (r: number) => (r * 180) / Math.PI
export const dir = (a: number): Pt => ({ x: Math.sin(rad(a)), y: Math.cos(rad(a)) })
const add = (p: Pt, a: number, len: number): Pt => ({ x: p.x + dir(a).x * len, y: p.y + dir(a).y * len })
export const angleTo = (from: Pt, to: Pt) => deg(Math.atan2(to.x - from.x, to.y - from.y))

/** Two-bone IK: angles of the upper and lower segment so the chain ends at `target`. `bend` picks the side the joint goes. */
export function ik(root: Pt, target: Pt, l1: number, l2: number, bend: 1 | -1): [number, number] {
  const d = Math.min(Math.hypot(target.x - root.x, target.y - root.y), l1 + l2 - 0.01)
  const cos = (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d)
  const a1 = angleTo(root, target) + bend * deg(Math.acos(Math.max(-1, Math.min(1, cos))))
  const joint = add(root, a1, l1)
  return [a1, angleTo(joint, target)]
}

/** Forward kinematics for one frame. */
export function solve(s: Spec): Figure {
  const hip = { x: s.hipX, y: s.hipY }
  const torso = s.torsoAt ? angleTo(hip, { x: s.torsoAt[0], y: s.torsoAt[1] }) : (s.torso ?? 180)
  const shoulder = add(hip, torso, L.torso - 4)
  const neck = add(hip, torso, L.torso)
  const perp = torso - 90
  const back = add(add(hip, torso, L.torso / 2), perp, s.curve ?? 0)
  const headAngle = s.head ?? torso
  const head = add(add(neck, headAngle, L.neck + L.headR), perp, s.headShift ?? 0)

  // Default bends: elbows go down/back, knees go forward/up.
  const arm = (ua?: number, fa?: number, to?: [number, number], bend: 1 | -1 = -1): [number, number] =>
    to ? ik(shoulder, { x: to[0], y: to[1] }, L.upperArm, L.forearm, bend) : [ua ?? 0, fa ?? ua ?? 0]
  const leg = (th?: number, sh?: number, to?: [number, number], bend: 1 | -1 = 1): [number, number] =>
    to ? ik(hip, { x: to[0], y: to[1] }, L.thigh, L.shin, bend) : [th ?? 0, sh ?? th ?? 0]

  const side = (a: [number, number], hand: number | undefined, l: [number, number], foot: number | undefined): Side => {
    const elbow = add(shoulder, a[0], L.upperArm)
    const wrist = add(elbow, a[1], L.forearm)
    const knee = add(hip, l[0], L.thigh)
    const ankle = add(knee, l[1], L.shin)
    const ft = foot ?? 90
    return { elbow, wrist, hand: add(wrist, hand ?? a[1], L.hand), knee, ankle, toe: add(ankle, ft, L.foot), heel: add(ankle, ft, -3) }
  }
  return {
    hip, shoulder, neck, head, back, face: headAngle - 90,
    n: side(arm(s.nUA, s.nFA, s.nArm, s.nArmBend), s.nH, leg(s.nTH, s.nSH, s.nLeg, s.nLegBend), s.nFT),
    f: side(arm(s.fUA, s.fFA, s.fArm, s.fArmBend), s.fH, leg(s.fTH, s.fSH, s.fLeg, s.fLegBend), s.fFT),
  }
}

const ease = (t: number) => 0.5 - Math.cos(Math.PI * t) / 2

/** Every numeric field, tuples included, eased from a to b. Scenes give every frame the same fields. */
function mix(a: Spec, b: Spec, t: number): Spec {
  const e = ease(t)
  const out: Record<string, unknown> = { ...b }
  for (const [k, va] of Object.entries(a)) {
    const vb = (b as unknown as Record<string, unknown>)[k]
    if (typeof va === 'number' && typeof vb === 'number') out[k] = va + (vb - va) * e
    else if (Array.isArray(va) && Array.isArray(vb)) out[k] = va.map((x: number, i: number) => x + ((vb[i] as number) - x) * e)
  }
  return out as unknown as Spec
}

export const cycleLength = (frames: Frame[]) => frames.reduce((n, f) => n + f.move + (f.hold ?? 0), 0)

/** The pose and caption at `ms` into the loop. Frame 0 is reached from the last frame, so the loop is seamless. */
export function at(base: Spec, frames: Frame[], ms: number): { spec: Spec; label?: string } {
  const specs = frames.map((f) => ({ ...base, ...f.spec }) as Spec)
  let t = ms % cycleLength(frames)
  for (let i = 0; i < frames.length; i++) {
    const f = frames[i]
    const from = specs[(i - 1 + frames.length) % frames.length]
    if (t < f.move) return { spec: mix(from, specs[i], t / f.move), label: f.label }
    t -= f.move
    if (t < (f.hold ?? 0)) return { spec: specs[i], label: f.label }
    t -= f.hold ?? 0
  }
  return { spec: specs[0], label: frames[0].label }
}
