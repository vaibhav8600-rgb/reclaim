import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Pause, Play } from 'lucide-react'
import { at, cycleLength, dir, L, solve, type Figure, type Frame, type Pt, type Segment, type Spec } from './animation'

/**
 * Looping 2D demonstrations of the starter exercises. One simple figure (see animation.ts), the working part in
 * the accent colour, a caption for each phase ("Lower slowly, 3–4 s"). Pauses when off screen or tapped; with
 * Reduce Motion, shows the start and key positions side by side instead of moving.
 */

interface Scene {
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

const FLOOR = 154
const INK = 'var(--color-ink)'
const ACCENT = 'var(--color-accent)'
const PROP = 'var(--color-faint)'
const PROP_FILL = 'var(--color-fill)'

/* ─────────── props ─────────── */

const Floor = ({ x1 = 0, x2 = 200 }: { x1?: number; x2?: number }) => <line x1={x1} y1={FLOOR} x2={x2} y2={FLOOR} stroke={PROP} strokeWidth={2} strokeLinecap="round" />
/** A chair seen from the side: seat at y 118, back on the left. */
const Chair = ({ x = 48 }: { x?: number }) => (
  <g stroke={PROP} strokeWidth={3} strokeLinecap="round" fill="none">
    <line x1={x} y1={118} x2={x + 40} y2={118} />
    <line x1={x + 4} y1={118} x2={x + 4} y2={FLOOR} />
    <line x1={x + 36} y1={118} x2={x + 36} y2={FLOOR} />
    <line x1={x} y1={118} x2={x - 4} y2={72} />
  </g>
)
const Table = ({ x1, x2, y }: { x1: number; x2: number; y: number }) => (
  <g stroke={PROP} strokeWidth={3} strokeLinecap="round">
    <rect x={x1} y={y} width={x2 - x1} height={5} rx={2} fill={PROP_FILL} />
    <line x1={x2 - 8} y1={y + 5} x2={x2 - 8} y2={FLOOR} />
  </g>
)
const Wall = ({ x, top = -40 }: { x: number; top?: number }) => <rect x={x} y={top} width={6} height={FLOOR - top} fill={PROP_FILL} stroke={PROP} strokeWidth={1.5} />
const Mat = ({ x1, x2 }: { x1: number; x2: number }) => <rect x={x1} y={FLOOR - 2} width={x2 - x1} height={4} rx={2} fill={PROP_FILL} stroke={PROP} strokeWidth={1} />

/** A dumbbell held across the hand. */
function Dumbbell({ f }: { f: Figure }) {
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

/* ─────────── the figure ─────────── */

function Body({ f, s, highlight = [] }: { f: Figure; s: Spec; highlight?: Segment[] }) {
  const color = (seg: Segment) => (highlight.includes(seg) ? ACCENT : INK)
  const effort = s.effort ?? 0
  const seg = (key: Segment, a: Pt, b: Pt, w = 7) => (
    <g key={key}>
      {effort > 0 && highlight.includes(key) && <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={ACCENT} strokeWidth={w + 8} strokeOpacity={0.22 * effort} strokeLinecap="round" />}
      <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={color(key)} strokeWidth={w} strokeLinecap="round" />
    </g>
  )
  const limbs = (side: 'n' | 'f') => {
    const x = f[side]
    return [
      seg(`${side}TH`, f.hip, x.knee), seg(`${side}SH`, x.knee, x.ankle), seg(`${side}FT`, x.heel, x.toe, 5),
      seg(`${side}UA`, f.shoulder, x.elbow), seg(`${side}FA`, x.elbow, x.wrist), seg(`${side}H`, x.wrist, x.hand, 5),
    ]
  }
  const headColor = color('head')
  return (
    <g>
      <g opacity={0.38}>{limbs('f')}</g>
      <path d={`M${f.hip.x} ${f.hip.y} Q${f.back.x} ${f.back.y} ${f.neck.x} ${f.neck.y}`} stroke={color('torso')} strokeWidth={9} strokeLinecap="round" fill="none" />
      <line x1={f.neck.x} y1={f.neck.y} x2={f.head.x} y2={f.head.y} stroke={INK} strokeWidth={6} strokeLinecap="round" />
      {effort > 0 && highlight.includes('head') && <circle cx={f.head.x} cy={f.head.y} r={L.headR + 5} fill={ACCENT} fillOpacity={0.2 * effort} />}
      <circle cx={f.head.x} cy={f.head.y} r={L.headR} fill={headColor} />
      {/* A nose, so the way the face points (and a chin tuck's glide back) reads */}
      <circle cx={f.head.x + dir(f.face).x * (L.headR + 1.5)} cy={f.head.y + dir(f.face).y * (L.headR + 1.5)} r={2.6} fill={headColor} />
      {limbs('n')}
    </g>
  )
}

/* ─────────── scenes ─────────── */

const seated: Spec = { hipX: 70, hipY: 114, torso: 172, head: 176, nTH: 90, nSH: 0, nFT: 90, fTH: 90, fSH: 0, fFT: 90 }
const standing: Spec = { hipX: 100, hipY: 76, torso: 180, head: 180, nUA: 4, nFA: 6, nH: 6, fUA: -4, fFA: 2, fH: 2, nTH: 0, nSH: 0, nFT: 90, fTH: 0, fSH: 0, fFT: 90 }
/** On the back, head to the left. */
const supine: Spec = { hipX: 104, hipY: 150, torso: -90, head: -90, nUA: 90, nFA: 90, nH: 90, fUA: 90, fFA: 90, fH: 90 }
/** On hands and knees: hands under the shoulders, knees under the hips. */
const fours: Spec = { hipX: 62, hipY: 112, torsoAt: [106, 101], head: 100, curve: 0, nUA: 0, nFA: 0, nH: 90, fUA: -2, fFA: -2, fH: 90, nTH: 0, nSH: -90, nFT: -90, fTH: 2, fSH: -90, fFT: -90 }
/** Forearm resting flat on a table, from the seated pose. */
const forearmOnTable: Partial<Spec> = { nUA: 19.3, nFA: 90 }

const SCENES: Record<string, Scene> = {
  'ex-wrist-ext-iso': {
    view: [36, 36, 130, 104],
    base: { ...seated, ...forearmOnTable, nH: 90, fArm: [110, 88], fH: 96, effort: 0 },
    frames: [
      { spec: { effort: 0 }, move: 600, hold: 700, label: 'Forearm supported, palm down' },
      { spec: { effort: 1 }, move: 500, hold: 3000, label: 'Press the back of the hand up into your other hand — hold' },
    ],
    highlight: ['nFA', 'nH'],
    back: <><Floor /><Chair /><Table x1={80} x2={190} y={100} /></>,
  },
  'ex-wrist-ext-ecc': {
    view: [36, 36, 130, 104],
    base: { ...seated, ...forearmOnTable, nH: 25, fArm: [94, 110], fH: 100 },
    frames: [
      { spec: { nH: 25, fArm: [113, 112], fH: 150 }, move: 700, label: 'Other hand under it' },
      { spec: { nH: 150, fArm: [114, 90], fH: 160 }, move: 900, hold: 600, label: 'Lift with the other hand' },
      { spec: { nH: 150, fArm: [94, 110], fH: 100 }, move: 600, hold: 200, label: 'Let go' },
      { spec: { nH: 25, fArm: [94, 110], fH: 100 }, move: 3500, hold: 500, label: 'Lower slowly on your own, 3–4 s' },
    ],
    highlight: ['nFA', 'nH'],
    back: <><Floor /><Chair /><Table x1={80} x2={107} y={100} /></>,
    front: (f) => <Dumbbell f={f} />,
  },
  'ex-grip-squeeze': {
    view: [0, 0, 200, 160],
    base: { hipX: 0, hipY: 0, p: 0 },
    frames: [
      { spec: { p: 0 }, move: 600, hold: 800, label: 'Relax fully' },
      { spec: { p: 1 }, move: 500, hold: 2200, label: 'Squeeze firmly, 2–3 s' },
    ],
    draw: (s) => {
      const p = s.p ?? 0
      const rx = 24 + 4 * p
      const ry = 24 - 7 * p
      const cx = 104
      const cy = 86
      // Fingers wrap over the top of the ball, the thumb underneath; both follow its squash.
      const arc = (from: number, to: number, grow: number) => {
        const pt = (t: number) => `${cx + Math.cos(t) * (rx + grow)} ${cy + Math.sin(t) * (ry + grow)}`
        return `M${pt(from)} A${rx + grow} ${ry + grow} 0 0 1 ${pt(to)}`
      }
      return (
        <g strokeLinecap="round" fill="none">
          <line x1={10} y1={112} x2={70} y2={100} stroke={INK} strokeWidth={16} />
          <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill={PROP_FILL} stroke={PROP} strokeWidth={2} />
          {[0, 1, 2, 3].map((i) => <path key={i} d={arc(Math.PI * (1.05 + i * 0.1), Math.PI * (1.62 + i * 0.1), 5 + i * 1.2)} stroke={ACCENT} strokeWidth={6} />)}
          <path d={arc(Math.PI * 0.45, Math.PI * 0.95, 4)} stroke={ACCENT} strokeWidth={7} />
          <path d={`M70 100 Q${cx - rx - 6} ${cy + 6} ${cx - rx - 4} ${cy - 4}`} stroke={INK} strokeWidth={12} />
        </g>
      )
    },
  },
  'ex-wrist-ext-stretch': {
    view: [62, 0, 125, 100],
    base: { ...standing, nUA: 90, nFA: 90, nH: 90, fArm: [140, 46], fH: 90 },
    frames: [
      { spec: { nH: 90, fArm: [138, 48], fH: 90 }, move: 800, hold: 500, label: 'Arm straight in front, palm down' },
      { spec: { nH: 12, fArm: [157, 44], fH: 200 }, move: 1000, hold: 2600, label: 'Gently bend the wrist down — hold' },
    ],
    highlight: ['nFA', 'nH'],
    back: <Floor />,
  },
  'ex-wrist-flex-stretch': {
    view: [62, 0, 125, 100],
    base: { ...standing, nUA: 90, nFA: 90, nH: 90, fArm: [138, 48], fH: 90 },
    frames: [
      { spec: { nH: 90, fArm: [138, 48], fH: 90 }, move: 800, hold: 500, label: 'Arm straight in front, palm up' },
      { spec: { nH: 165, fArm: [156, 26], fH: -20 }, move: 1000, hold: 2600, label: 'Gently bend the wrist back — hold' },
    ],
    highlight: ['nFA', 'nH'],
    back: <Floor />,
  },
  'ex-pro-sup': {
    view: [0, 0, 200, 160],
    base: { hipX: 0, hipY: 0, p: 0 },
    frames: [
      { spec: { p: 0 }, move: 1400, hold: 300, label: 'Rotate slowly: palm down' },
      { spec: { p: 1 }, move: 1400, hold: 300, label: 'Rotate slowly: palm up' },
    ],
    note: 'Seen from the front: elbow bent at your side',
    draw: (s) => {
      const a = -65 + 130 * (s.p ?? 0)
      const c = { x: 100, y: 104 }
      const d = dir(180 + a)
      const end = { x: c.x + d.x * 52, y: c.y + d.y * 52 }
      const across = dir(270 + a)
      return (
        <g strokeLinecap="round">
          <path d="M100 104 L100 150" stroke={INK} strokeWidth={16} opacity={0.35} />
          <line x1={c.x} y1={c.y} x2={end.x} y2={end.y} stroke={PROP} strokeWidth={6} />
          <line x1={end.x - across.x * 14} y1={end.y - across.y * 14} x2={end.x + across.x * 14} y2={end.y + across.y * 14} stroke={PROP} strokeWidth={10} />
          <circle cx={c.x} cy={c.y} r={15} fill={ACCENT} />
        </g>
      )
    },
  },
  'ex-pendulum': {
    view: [0, 0, 200, 160],
    base: { ...standing, hipX: 78, torso: 118, head: 112, nUA: 0, nFA: 0, nH: 0, fArm: [150, 90], nTH: 6, nSH: -4, fTH: -10, fSH: -10 },
    frames: [
      { spec: { nUA: 18, nFA: 20, nH: 20 }, move: 1000, label: 'Relax and let the arm swing' },
      { spec: { nUA: -18, nFA: -20, nH: -20 }, move: 1000, label: 'Relax and let the arm swing' },
    ],
    highlight: ['nUA', 'nFA', 'nH'],
    back: <><Floor /><Table x1={138} x2={196} y={94} /></>,
  },
  'ex-shoulder-er-band': {
    view: [0, 0, 200, 160],
    base: { hipX: 0, hipY: 0, p: 0 },
    frames: [
      { spec: { p: 0 }, move: 1500, hold: 300, label: 'Return slowly' },
      { spec: { p: 1 }, move: 1000, hold: 400, label: 'Elbow at your side: rotate out against the band' },
    ],
    note: 'Seen from above',
    draw: (s) => {
      const p = s.p ?? 0
      const elbow = { x: 132, y: 92 }
      const d = dir(180 - 85 * p)
      const hand = { x: elbow.x + d.x * 40, y: elbow.y + d.y * 40 }
      return (
        <g strokeLinecap="round">
          <line x1={20} y1={20} x2={20} y2={60} stroke={PROP} strokeWidth={6} />
          <line x1={20} y1={40} x2={hand.x} y2={hand.y} stroke={ACCENT} strokeWidth={2.5} opacity={0.7} />
          <ellipse cx={100} cy={96} rx={40} ry={14} fill={INK} opacity={0.35} />
          <circle cx={100} cy={96} r={14} fill={INK} />
          <circle cx={elbow.x} cy={elbow.y} r={6} fill={INK} />
          <line x1={elbow.x} y1={elbow.y} x2={hand.x} y2={hand.y} stroke={ACCENT} strokeWidth={8} />
        </g>
      )
    },
  },
  'ex-scap-squeeze': {
    view: [0, 0, 200, 160],
    base: { hipX: 0, hipY: 0, p: 0 },
    frames: [
      { spec: { p: 0 }, move: 800, hold: 700, label: 'Sit or stand tall' },
      { spec: { p: 1 }, move: 700, hold: 2400, label: 'Draw the shoulder blades back and down — hold 3 s' },
    ],
    note: 'Seen from behind',
    draw: (s) => {
      const p = s.p ?? 0
      const blade = (side: 1 | -1) => {
        const x = 100 + side * (26 - 9 * p)
        const y = 58 + 5 * p
        return `M${x} ${y} L${x + side * 16} ${y - 4} L${x + side * 4} ${y + 30} Z`
      }
      return (
        <g strokeLinecap="round" strokeLinejoin="round">
          <path d="M52 50 Q100 38 148 50 L132 150 L68 150 Z" fill={INK} opacity={0.35} />
          <circle cx={100} cy={26} r={15} fill={INK} />
          <line x1={100} y1={46} x2={100} y2={148} stroke={INK} strokeWidth={2} opacity={0.5} />
          <line x1={54} y1={52} x2={46} y2={130} stroke={INK} strokeWidth={9} opacity={0.35} />
          <line x1={146} y1={52} x2={154} y2={130} stroke={INK} strokeWidth={9} opacity={0.35} />
          <path d={blade(-1)} fill={ACCENT} />
          <path d={blade(1)} fill={ACCENT} />
        </g>
      )
    },
  },
  'ex-wall-slide': {
    view: [0, -40, 200, 200],
    base: { ...standing, hipX: 126, nArm: [150, 14], nArmBend: 1, fArm: [148, 16], fArmBend: 1 },
    frames: [
      { spec: { nArm: [150, 14], fArm: [148, 16] }, move: 1400, hold: 300, label: 'Forearms on the wall — slide down' },
      { spec: { nArm: [150, -24], fArm: [148, -22] }, move: 1600, hold: 400, label: 'Slide up as far as comfortable' },
    ],
    highlight: ['nUA', 'nFA'],
    back: <><Floor /><Wall x={157} /></>,
  },
  'ex-cat-cow': {
    view: [0, 40, 200, 120],
    base: { ...fours },
    frames: [
      { spec: { curve: -11, head: 35 }, move: 1600, hold: 500, label: 'Round the back up, head down' },
      { spec: { curve: 7, head: 128 }, move: 1600, hold: 500, label: 'Let the back sag gently, look up' },
    ],
    highlight: ['torso'],
    back: <Mat x1={6} x2={130} />,
  },
  'ex-bird-dog': {
    view: [0, 40, 200, 120],
    base: { ...fours, head: 95 },
    frames: [
      { spec: {}, move: 1300, hold: 400, label: 'Hands under shoulders, knees under hips' },
      { spec: { fUA: 96, fFA: 96, fH: 96, nTH: -88, nSH: -90, nFT: -20 }, move: 1400, hold: 1400, label: 'Reach the opposite arm and leg — keep the back level' },
    ],
    highlight: ['fUA', 'fFA', 'nTH', 'nSH'],
    back: <Mat x1={6} x2={130} />,
  },
  'ex-glute-bridge': {
    view: [0, 70, 200, 90],
    base: { ...supine, torsoAt: [54, 150], nLeg: [142, 151], fLeg: [140, 151], nFT: 90, fFT: 90, effort: 0 },
    frames: [
      { spec: { hipY: 150, effort: 0 }, move: 1600, hold: 500, label: 'Lower slowly' },
      { spec: { hipY: 122, effort: 1 }, move: 1000, hold: 1500, label: 'Squeeze the glutes and lift the hips — hold 2 s' },
    ],
    highlight: ['nTH', 'fTH'],
    back: <Mat x1={20} x2={170} />,
  },
  'ex-dead-bug': {
    view: [0, 50, 200, 110],
    base: { ...supine, hipX: 110, nUA: 180, nFA: 180, nH: 180, fUA: 178, fFA: 178, fH: 178, nTH: 180, nSH: 90, nFT: 180, fTH: 178, fSH: 90, fFT: 180 },
    frames: [
      { spec: {}, move: 1300, hold: 400, label: 'Arms up, knees over the hips' },
      { spec: { fUA: 260, fFA: 260, fH: 260, nTH: 98, nSH: 95, nFT: 160 }, move: 1900, hold: 500, label: 'Lower the opposite arm and leg slowly — back stays flat' },
    ],
    highlight: ['fUA', 'fFA', 'nTH', 'nSH'],
    back: <Mat x1={10} x2={190} />,
  },
  'ex-quad-set': {
    view: [0, 80, 200, 80],
    base: { ...supine, hipX: 96, nTH: 90, nSH: 90, nFT: 180, fLeg: [128, 151], fFT: 90, effort: 0 },
    frames: [
      { spec: { effort: 0, nTH: 90 }, move: 600, hold: 900, label: 'Relax' },
      { spec: { effort: 1, nTH: 91.5 }, move: 400, hold: 2600, label: 'Tighten the thigh, press the knee down — 5 s' },
    ],
    highlight: ['nTH'],
    back: <><Mat x1={20} x2={190} /><ellipse cx={134} cy={150} rx={8} ry={4} fill={PROP_FILL} stroke={PROP} strokeWidth={1.5} /></>,
  },
  'ex-slr': {
    view: [0, 70, 200, 90],
    base: { ...supine, hipX: 96, nTH: 90, nSH: 90, nFT: 180, fLeg: [128, 151], fFT: 90 },
    frames: [
      { spec: { nTH: 90, nSH: 90, nFT: 180 }, move: 1700, hold: 500, label: 'Lower slowly' },
      { spec: { nTH: 124, nSH: 124, nFT: 214 }, move: 1300, hold: 700, label: 'Tighten the thigh and lift to the height of the other knee' },
    ],
    highlight: ['nTH', 'nSH'],
    back: <Mat x1={20} x2={190} />,
  },
  'ex-heel-slide': {
    view: [0, 70, 200, 90],
    base: { ...supine, hipX: 96, nLeg: [170, 151], nFT: 180, fTH: 90, fSH: 90, fFT: 180 },
    frames: [
      { spec: { nLeg: [170, 151], nFT: 180 }, move: 1700, hold: 400, label: 'Straighten the leg' },
      { spec: { nLeg: [124, 151], nFT: 135 }, move: 1700, hold: 400, label: 'Slide the heel towards you as far as comfortable' },
    ],
    highlight: ['nTH', 'nSH'],
    back: <Mat x1={20} x2={190} />,
  },
  'ex-wall-sit': {
    view: [0, 0, 200, 160],
    base: { ...standing, hipX: 50, hipY: 90, nUA: 6, nFA: 10, fUA: 0, fFA: 6, nLeg: [92, 150], fLeg: [90, 150], effort: 0 },
    frames: [
      { spec: { hipY: 90, effort: 0 }, move: 1500, hold: 700, label: 'Slide back up' },
      { spec: { hipY: 113, effort: 1 }, move: 1700, hold: 3000, label: 'Slide down the wall and hold' },
    ],
    highlight: ['nTH', 'fTH'],
    back: <><Floor /><Wall x={38} top={0} /></>,
  },
  'ex-step-up': {
    view: [0, -30, 200, 190],
    base: { ...standing, hipX: 86, torso: 177, nLeg: [92, 150], fLeg: [86, 150] },
    frames: [
      { spec: { hipX: 86, hipY: 76, nLeg: [92, 150], fLeg: [86, 150] }, move: 900, hold: 500, label: 'Both feet down' },
      { spec: { hipX: 94, hipY: 74, nLeg: [132, 124] }, move: 900, hold: 200, label: 'Put one foot on the step' },
      { spec: { hipX: 128, hipY: 50, nLeg: [132, 124], fLeg: [126, 124] }, move: 1100, hold: 500, label: 'Step up with control' },
      { spec: { hipX: 94, hipY: 74, nLeg: [132, 124], fLeg: [86, 150] }, move: 1100, hold: 200, label: 'Step back down' },
    ],
    highlight: ['nTH', 'nSH'],
    back: <><Floor /><rect x={114} y={128} width={70} height={26} rx={3} fill={PROP_FILL} stroke={PROP} strokeWidth={2} /></>,
  },
  'ex-clamshell': {
    view: [0, 60, 200, 100],
    base: { hipX: 0, hipY: 0, p: 0 },
    frames: [
      { spec: { p: 0 }, move: 1300, hold: 400, label: 'Knees together, feet together' },
      { spec: { p: 1 }, move: 1100, hold: 800, label: 'Open the top knee — feet stay together' },
    ],
    note: 'Lying on your side, seen from the front',
    draw: (s) => {
      const p = s.p ?? 0
      const hip = { x: 108, y: 136 }
      const foot = { x: 126, y: 146 }
      const top = { x: 148 - 4 * p, y: 136 - 30 * p }
      return (
        <g strokeLinecap="round" strokeLinejoin="round" fill="none">
          <Mat x1={20} x2={180} />
          <line x1={40} y1={148} x2={70} y2={140} stroke={INK} strokeWidth={7} opacity={0.38} />
          <circle cx={36} cy={132} r={9} fill={INK} />
          <path d={`M${hip.x} ${hip.y + 4} L62 138`} stroke={INK} strokeWidth={9} />
          <line x1={hip.x} y1={hip.y + 6} x2={150} y2={146} stroke={INK} strokeWidth={7} opacity={0.38} />
          <line x1={150} y1={146} x2={foot.x} y2={foot.y + 3} stroke={INK} strokeWidth={7} opacity={0.38} />
          <line x1={(hip.x + 150) / 2} y1={(hip.y + 152) / 2} x2={(hip.x + top.x) / 2} y2={(hip.y + top.y) / 2} stroke={ACCENT} strokeWidth={2.5} opacity={0.7} />
          <line x1={hip.x} y1={hip.y} x2={top.x} y2={top.y} stroke={ACCENT} strokeWidth={7} />
          <line x1={top.x} y1={top.y} x2={foot.x} y2={foot.y} stroke={INK} strokeWidth={7} />
        </g>
      )
    },
  },
  'ex-ankle-alphabet': {
    view: [0, 40, 200, 120],
    base: { ...seated, torso: 176, nUA: 10, nFA: 60, fUA: 6, fFA: 60, nTH: 90, nSH: 72, nFT: 150 },
    frames: [
      { spec: { nFT: 150 }, move: 700, label: 'Trace the letters A, B, C… with your big toe' },
      { spec: { nFT: 62 }, move: 900, label: 'Trace the letters A, B, C… with your big toe' },
      { spec: { nFT: 128 }, move: 700, label: 'Trace the letters A, B, C… with your big toe' },
      { spec: { nFT: 84 }, move: 600, label: 'Trace the letters A, B, C… with your big toe' },
    ],
    highlight: ['nFT'],
    back: <><Floor /><Chair /></>,
  },
  'ex-calf-raise': {
    view: [0, 0, 200, 160],
    base: { ...standing, fArm: [140, 76], nFT: 90, fFT: 90 },
    frames: [
      { spec: { hipX: 100, hipY: 76, nFT: 90, fFT: 90 }, move: 1500, hold: 300, label: 'Lower slowly' },
      { spec: { hipX: 102.8, hipY: 68.3, nFT: 50, fFT: 50 }, move: 900, hold: 600, label: 'Rise up onto your toes' },
    ],
    highlight: ['nSH', 'fSH', 'nFT'],
    back: <><Floor /><Chair x={142} /></>,
  },
  'ex-single-leg-balance': {
    view: [0, 0, 200, 160],
    base: { ...standing, fArm: [138, 82], fTH: 62, fSH: -12, fFT: 80 },
    frames: [
      { spec: { hipX: 98.5, torso: 177 }, move: 1500, label: 'Balance on one leg, 20–30 s' },
      { spec: { hipX: 101.5, torso: 183 }, move: 1500, label: 'Balance on one leg, 20–30 s' },
    ],
    highlight: ['nTH', 'nSH'],
    back: <><Floor /><Chair x={142} /></>,
  },
  'ex-chin-tuck': {
    view: [55, -8, 90, 72],
    base: { ...standing, effort: 0, headShift: 0 },
    frames: [
      { spec: { headShift: 0, effort: 0 }, move: 900, hold: 700, label: 'Sit or stand tall' },
      { spec: { headShift: -7, effort: 1 }, move: 900, hold: 2400, label: 'Glide the chin straight back — hold 3 s' },
    ],
    highlight: ['head'],
  },
}

export const hasAnimation = (exerciseId: string) => exerciseId in SCENES

function usePrefersReducedMotion() {
  const [reduce, setReduce] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const on = () => setReduce(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return reduce
}

function Picture({ scene, spec }: { scene: Scene; spec: Spec }) {
  const [x, y, w, h] = scene.view
  return (
    <svg viewBox={`${x} ${y} ${w} ${h}`} className="block h-full w-full" aria-hidden>
      {scene.draw ? scene.draw(spec) : (() => {
        const f = solve(spec)
        return <>{scene.back}<Body f={f} s={spec} highlight={scene.highlight} />{scene.front?.(f, spec)}</>
      })()}
    </svg>
  )
}

/** A looping demonstration of a starter exercise, or nothing for exercises without one. */
export function ExerciseAnimation({ exerciseId, name, compact }: { exerciseId: string; name: string; compact?: boolean }) {
  const scene = SCENES[exerciseId]
  const reduce = usePrefersReducedMotion()
  const box = useRef<HTMLDivElement>(null)
  const [ms, setMs] = useState(0)
  const [visible, setVisible] = useState(false)
  const [paused, setPaused] = useState(false)
  const elapsed = useRef(0)

  // Only animate while on screen (a plan can show several).
  useEffect(() => {
    const el = box.current
    if (!el) return
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting))
    io.observe(el)
    return () => io.disconnect()
  }, [])

  useEffect(() => {
    if (!scene || reduce || !visible || paused) return
    let raf = 0
    const start = performance.now() - elapsed.current
    const tick = (now: number) => {
      elapsed.current = (now - start) % cycleLength(scene.frames)
      setMs(elapsed.current)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [scene, reduce, visible, paused])

  if (!scene) return null
  const labels = [...new Set(scene.frames.map((f) => f.label).filter(Boolean))]
  const description = `How to do ${name}: ${labels.join('; ')}.`
  const height = compact ? 'h-32' : 'h-48'

  if (reduce) {
    // Still pictures: where it starts, and the position that matters (the longest hold, or the next frame).
    const key = scene.frames.reduce((best, f, i) => ((f.hold ?? 0) >= (scene.frames[best].hold ?? 0) ? i : best), 0)
    const shown = key === 0 ? [0, 1] : [0, key]
    return (
      <div ref={box} className="grid grid-cols-2 gap-2" role="img" aria-label={description}>
        {shown.map((i) => (
          <figure key={i} className="rounded-2xl bg-bg p-2">
            <div className={compact ? 'h-24' : 'h-32'}><Picture scene={scene} spec={{ ...scene.base, ...scene.frames[i].spec } as Spec} /></div>
            <figcaption className="mt-1 text-center text-[0.75rem] text-muted">{scene.frames[i].label}</figcaption>
          </figure>
        ))}
      </div>
    )
  }

  const now = at(scene.base, scene.frames, ms)
  return (
    <div ref={box} className="relative">
      <button type="button" onClick={() => setPaused((p) => !p)} className="block w-full rounded-2xl bg-bg" aria-label={paused ? `Play how to do ${name}` : `Pause how to do ${name}`}>
        <div className={height} role="img" aria-label={description}><Picture scene={scene} spec={now.spec} /></div>
      </button>
      <span className="pointer-events-none absolute top-2 right-2 flex h-7 w-7 items-center justify-center rounded-full bg-surface/80 text-muted" aria-hidden>
        {paused ? <Play size={14} /> : <Pause size={14} />}
      </span>
      <p className="mt-2 min-h-[2.5em] text-center text-[0.9375rem] font-medium" aria-hidden data-testid="animation-caption">{now.label}</p>
      {scene.note && <p className="text-center text-[0.75rem] text-faint">{scene.note}</p>}
    </div>
  )
}
