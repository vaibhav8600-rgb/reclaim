import type { ReactNode } from 'react'
import type { Figure, Frame, Pt, Segment, Spec } from './animation'

/** Shared by the rehab and fitness demonstrations: the scene shape, props, colours and starting poses. */

export interface Scene {
  view: [number, number, number, number]
  base: Spec
  frames: Frame[]
  highlight?: Segment[]
  /** Drawn behind the figure (furniture), or in front of it (weights, bands). */
  back?: ReactNode
  front?: (f: Figure, s: Spec) => ReactNode
  /** Views the side-on figure can't show (seen from above, behind, the front): drawn instead of it. */
  draw?: (s: Spec) => ReactNode
  note?: string
}

export const FLOOR = 154
export const INK = 'var(--color-ink)'
export const ACCENT = 'var(--color-accent)'
export const PROP = 'var(--color-faint)'
export const PROP_FILL = 'var(--color-fill)'

/* ─────────── props ─────────── */

export const Floor = ({ x1 = 0, x2 = 200 }: { x1?: number; x2?: number }) => <line x1={x1} y1={FLOOR} x2={x2} y2={FLOOR} stroke={PROP} strokeWidth={2} strokeLinecap="round" />
/** A chair seen from the side: seat at y 118, back on the left. */
export const Chair = ({ x = 48 }: { x?: number }) => (
  <g stroke={PROP} strokeWidth={3} strokeLinecap="round" fill="none">
    <line x1={x} y1={118} x2={x + 40} y2={118} />
    <line x1={x + 4} y1={118} x2={x + 4} y2={FLOOR} />
    <line x1={x + 36} y1={118} x2={x + 36} y2={FLOOR} />
    <line x1={x} y1={118} x2={x - 4} y2={72} />
  </g>
)
export const Table = ({ x1, x2, y }: { x1: number; x2: number; y: number }) => (
  <g stroke={PROP} strokeWidth={3} strokeLinecap="round">
    <rect x={x1} y={y} width={x2 - x1} height={5} rx={2} fill={PROP_FILL} />
    <line x1={x2 - 8} y1={y + 5} x2={x2 - 8} y2={FLOOR} />
  </g>
)
export const Wall = ({ x, top = -40 }: { x: number; top?: number }) => <rect x={x} y={top} width={6} height={FLOOR - top} fill={PROP_FILL} stroke={PROP} strokeWidth={1.5} />
export const Mat = ({ x1, x2 }: { x1: number; x2: number }) => <rect x={x1} y={FLOOR - 2} width={x2 - x1} height={4} rx={2} fill={PROP_FILL} stroke={PROP} strokeWidth={1} />

/** A dumbbell held across the hand. */
export function Dumbbell({ f }: { f: Figure }) {
  const c = { x: (f.n.wrist.x + f.n.hand.x) / 2, y: (f.n.wrist.y + f.n.hand.y) / 2 }
  const a = Math.atan2(f.n.hand.y - f.n.wrist.y, f.n.hand.x - f.n.wrist.x) + Math.PI / 2
  const e = (k: number): Pt => ({ x: c.x + Math.cos(a) * k, y: c.y + Math.sin(a) * k })
  return (
    <g stroke={PROP} strokeWidth={3} strokeLinecap="round">
      <line x1={e(-9).x} y1={e(-9).y} x2={e(9).x} y2={e(9).y} />
      <circle cx={e(-9).x} cy={e(-9).y} r={4.5} fill={PROP_FILL} />
      <circle cx={e(9).x} cy={e(9).y} r={4.5} fill={PROP_FILL} />
    </g>
  )
}

/* ─────────── starting poses ─────────── */

export const seated: Spec = { hipX: 70, hipY: 114, torso: 172, head: 176, nTH: 90, nSH: 0, nFT: 90, fTH: 90, fSH: 0, fFT: 90 }
export const standing: Spec = { hipX: 100, hipY: 76, torso: 180, head: 180, nUA: 4, nFA: 6, nH: 6, fUA: -4, fFA: 2, fH: 2, nTH: 0, nSH: 0, nFT: 90, fTH: 0, fSH: 0, fFT: 90 }
/** On the back, head to the left. */
export const supine: Spec = { hipX: 104, hipY: 150, torso: -90, head: -90, nUA: 90, nFA: 90, nH: 90, fUA: 90, fFA: 90, fH: 90 }
/** On hands and knees: hands under the shoulders, knees under the hips. */
export const fours: Spec = { hipX: 62, hipY: 112, torsoAt: [106, 101], head: 100, curve: 0, nUA: 0, nFA: 0, nH: 90, fUA: -2, fFA: -2, fH: 90, nTH: 0, nSH: -90, nFT: -90, fTH: 2, fSH: -90, fFT: -90 }
/** Forearm resting flat on a table, from the seated pose. */
export const forearmOnTable: Partial<Spec> = { nUA: 19.3, nFA: 90 }

