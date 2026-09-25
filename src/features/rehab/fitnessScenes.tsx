import { dir, type Figure, type Pt, type Spec } from './animation'
import { ACCENT, Chair, Dumbbell, Floor, FLOOR, fours, INK, Mat, PROP, PROP_FILL, seated, standing, supine, type Scene } from './sceneKit'

/**
 * Demonstrations for the fitness library (strength, cardio, mobility), with the same figure as the rehab ones.
 * Side view unless noted; feet and hands that should stay put are driven by targets (see animation.ts).
 */

/* ─────────── props ─────────── */

/** A barbell seen end-on: a weight plate at the hands. */
const Plate = ({ at, r = 16 }: { at: Pt; r?: number }) => (
  <g>
    <circle cx={at.x} cy={at.y} r={r} fill={PROP_FILL} stroke={PROP} strokeWidth={2.5} />
    <circle cx={at.x} cy={at.y} r={3} fill={PROP} />
  </g>
)
const Bench = ({ x1, x2, y = 118 }: { x1: number; x2: number; y?: number }) => (
  <g stroke={PROP} strokeWidth={3} strokeLinecap="round">
    <rect x={x1} y={y} width={x2 - x1} height={6} rx={2} fill={PROP_FILL} />
    <line x1={x1 + 8} y1={y + 6} x2={x1 + 8} y2={FLOOR} />
    <line x1={x2 - 8} y1={y + 6} x2={x2 - 8} y2={FLOOR} />
  </g>
)
const Step = ({ x1, x2, y }: { x1: number; x2: number; y: number }) => <rect x={x1} y={y} width={x2 - x1} height={FLOOR - y} rx={3} fill={PROP_FILL} stroke={PROP} strokeWidth={2} />
/** A handle at the hands, with its cable running to `to`. */
const Cable = ({ f, to }: { f: Figure; to: Pt }) => (
  <g strokeLinecap="round">
    <line x1={f.n.hand.x} y1={f.n.hand.y} x2={to.x} y2={to.y} stroke={PROP} strokeWidth={1.5} />
    <line x1={f.n.wrist.x} y1={f.n.wrist.y} x2={f.n.hand.x} y2={f.n.hand.y} stroke={PROP} strokeWidth={5} />
  </g>
)
const Water = () => <path d="M0 96 Q12 92 24 96 T48 96 T72 96 T96 96 T120 96 T144 96 T168 96 T192 96 T216 96" stroke={PROP} strokeWidth={2} fill="none" />

/* ─────────── poses ─────────── */

const feet = { nLeg: [104, 150] as [number, number], fLeg: [102, 150] as [number, number] }
/** Standing with feet planted (for squats and hinges). */
const planted: Spec = { ...standing, ...feet }
/** The thigh angle that puts the knee at `knee` (kneeling: the knee stays on the floor while the hip moves). */
const legsFor = (hipX: number, hipY: number, knee: Pt) => (Math.atan2(knee.x - hipX, knee.y - hipY) * 180) / Math.PI
/** Pedal and elliptical paths: points around an ellipse, starting at `start` degrees. */
const around = (cx: number, cy: number, rx: number, ry: number, start: number, n = 8) =>
  Array.from({ length: n }, (_, i) => {
    const t = ((start + (360 / n) * i) * Math.PI) / 180
    return [cx + Math.cos(t) * rx, cy + Math.sin(t) * ry] as [number, number]
  })

/* ─────────── scenes ─────────── */

const pedals = around(114, 134, 14, 14, 90)
const ellipse = around(106, 143, 17, 6, 0, 6)

export const FITNESS_SCENES: Record<string, Scene> = {
  /* Strength: bodyweight */
  'fx-sit-to-stand': {
    view: [20, 0, 160, 160],
    base: { ...seated, nLeg: [100, 150], fLeg: [98, 150], nUA: 70, nFA: 80, nH: 80, fUA: 66, fFA: 76, fH: 76 },
    frames: [
      { spec: { hipX: 70, hipY: 114, torso: 172, head: 176 }, move: 1200, hold: 600, label: 'Sit near the front of the chair, feet flat' },
      { spec: { hipX: 74, hipY: 112, torso: 134, head: 140 }, move: 700, label: 'Lean forward, nose over toes' },
      { spec: { hipX: 97, hipY: 77, torso: 180, head: 180 }, move: 900, hold: 500, label: 'Stand up without using your hands' },
      { spec: { hipX: 73, hipY: 112, torso: 146, head: 150 }, move: 1400, label: 'Sit back down slowly' },
    ],
    highlight: ['nTH', 'fTH'],
    back: <><Floor /><Chair /></>,
  },
  'fx-squat': {
    view: [20, 0, 160, 160],
    base: { ...planted, nUA: 10, nFA: 10, nH: 10, fUA: 8, fFA: 8, fH: 8 },
    frames: [
      { spec: { hipX: 100, hipY: 76, torso: 180, head: 180, nUA: 10, nFA: 10, fUA: 8, fFA: 8 }, move: 1000, hold: 400, label: 'Feet shoulder-width apart' },
      { spec: { hipX: 80, hipY: 110, torso: 146, head: 150, nUA: 92, nFA: 92, fUA: 90, fFA: 90 }, move: 1400, hold: 400, label: 'Sit the hips back and down, chest up' },
    ],
    highlight: ['nTH', 'fTH'],
    back: <Floor />,
  },
  'fx-lunge': {
    view: [10, 0, 170, 160],
    base: { ...standing, nLeg: [106, 150], fLeg: [100, 150], fFT: 90 },
    frames: [
      { spec: { hipX: 100, hipY: 76, fLeg: [100, 150], fFT: 90 }, move: 1100, hold: 400, label: 'Stand tall' },
      { spec: { hipX: 84, hipY: 108, fLeg: [46, 150], fFT: 60 }, move: 1300, hold: 500, label: 'Step back and lower the back knee towards the floor' },
    ],
    highlight: ['nTH', 'nSH'],
    back: <Floor />,
  },
  'fx-pushup': {
    view: [20, 60, 170, 100],
    base: { hipX: 111, hipY: 121, torsoAt: [150, 104], head: 112, nArm: [152, 152], fArm: [150, 152], nH: 90, fH: 90, nLeg: [44, 146], fLeg: [46, 146], nFT: 20, fFT: 20 },
    frames: [
      { spec: { hipX: 111, hipY: 121, torsoAt: [150, 104], head: 112 }, move: 1000, hold: 300, label: 'Body in a straight line, hands under the shoulders' },
      { spec: { hipX: 116, hipY: 132, torsoAt: [158, 124], head: 102 }, move: 1400, hold: 200, label: 'Lower the chest towards the floor, then push up' },
    ],
    highlight: ['nUA', 'nFA'],
    back: <Mat x1={30} x2={180} />,
    note: 'Easier against a wall or a kitchen counter',
  },
  'fx-plank': {
    view: [20, 80, 180, 80],
    base: { hipX: 113, hipY: 133, torsoAt: [154, 125], head: 102, nUA: 0, nFA: 90, nH: 90, fUA: 2, fFA: 90, fH: 90, nLeg: [40, 146], fLeg: [42, 146], nFT: 20, fFT: 20, effort: 0 },
    frames: [
      { spec: { effort: 0 }, move: 600, hold: 800, label: 'On forearms and toes (or knees)' },
      { spec: { effort: 1 }, move: 500, hold: 3000, label: 'A straight line from head to heels — breathe and hold' },
    ],
    highlight: ['torso'],
    back: <Mat x1={30} x2={190} />,
  },
  'fx-side-plank': {
    view: [0, 60, 200, 100],
    base: { hipX: 0, hipY: 0, p: 0 },
    frames: [
      { spec: { p: 0 }, move: 1200, hold: 500, label: 'On one forearm, feet stacked' },
      { spec: { p: 1 }, move: 1000, hold: 2500, label: 'Lift the hips until the body is straight — hold' },
    ],
    note: 'Seen from the front',
    draw: (s) => {
      const p = s.p ?? 0
      const feet = { x: 30, y: 148 }
      const shoulder = { x: 142, y: 110 }
      const hip = { x: 86, y: 146 - 18 * p }
      return (
        <g strokeLinecap="round" strokeLinejoin="round" fill="none">
          <Mat x1={10} x2={190} />
          <line x1={feet.x} y1={feet.y} x2={hip.x} y2={hip.y} stroke={INK} strokeWidth={8} />
          <line x1={hip.x} y1={hip.y} x2={shoulder.x} y2={shoulder.y} stroke={ACCENT} strokeWidth={10} />
          <line x1={shoulder.x} y1={shoulder.y} x2={150} y2={148} stroke={INK} strokeWidth={7} />
          <line x1={150} y1={148} x2={176} y2={148} stroke={INK} strokeWidth={7} />
          <line x1={shoulder.x} y1={shoulder.y} x2={shoulder.x - 8} y2={shoulder.y - 40} stroke={INK} strokeWidth={7} opacity={0.4} />
          <circle cx={shoulder.x + 14} cy={shoulder.y - 12} r={9} fill={INK} />
        </g>
      )
    },
  },
  'fx-crunch': {
    view: [0, 70, 200, 90],
    base: { ...supine, torsoAt: undefined, nLeg: [140, 151], fLeg: [138, 151], nFT: 90, fFT: 90, nUA: 100, nFA: 100, nH: 100, fUA: 98, fFA: 98, fH: 98 },
    frames: [
      { spec: { torso: -90, head: -90, nUA: 94, nFA: 94, fUA: 92, fFA: 92 }, move: 1400, hold: 400, label: 'Lie on your back, knees bent' },
      { spec: { torso: -116, head: -110, nUA: 112, nFA: 112, fUA: 110, fFA: 110 }, move: 900, hold: 600, label: 'Curl the shoulders off the floor, then lower slowly' },
    ],
    highlight: ['torso'],
    back: <Mat x1={20} x2={170} />,
  },
  'fx-superman': {
    view: [0, 90, 200, 70],
    base: { hipX: 90, hipY: 146, torso: 90, head: 92, nTH: -90, nSH: -90, nFT: 0, fTH: -90, fSH: -90, fFT: 0, nUA: 90, nFA: 90, nH: 90, fUA: 90, fFA: 90, fH: 90 },
    frames: [
      { spec: { torso: 90, head: 92, nTH: -90, nSH: -90, fTH: -90, fSH: -90, nUA: 90, nFA: 90, fUA: 90, fFA: 90 }, move: 1200, hold: 400, label: 'Lie face down, arms forward' },
      { spec: { torso: 100, head: 104, nTH: -100, nSH: -100, fTH: -99, fSH: -99, nUA: 104, nFA: 104, fUA: 103, fFA: 103 }, move: 1000, hold: 1800, label: 'Lift the chest and legs a little — hold 2 s' },
    ],
    highlight: ['torso', 'nTH'],
    back: <Mat x1={10} x2={190} />,
  },

  /* Strength: dumbbells */
  'fx-goblet-squat': {
    view: [20, 0, 160, 160],
    base: { ...planted, nUA: 24, nFA: 168, nH: 168, fUA: 22, fFA: 166, fH: 166 },
    frames: [
      { spec: { hipX: 100, hipY: 76, torso: 180, head: 180 }, move: 1000, hold: 400, label: 'Hold the weight at your chest' },
      { spec: { hipX: 82, hipY: 110, torso: 150, head: 156 }, move: 1400, hold: 400, label: 'Squat down, chest up, knees over the toes' },
    ],
    highlight: ['nTH', 'fTH'],
    back: <Floor />,
    front: (f) => <Dumbbell f={f} />,
  },
  'fx-db-row': {
    view: [20, 20, 160, 140],
    base: { hipX: 80, hipY: 80, torso: 104, head: 102, fArm: [121, 118], fH: 90, fTH: 0, fSH: -90, fFT: -90, nLeg: [68, 150], nFT: 90, nUA: 0, nFA: 0, nH: 0 },
    frames: [
      { spec: { nUA: 0, nFA: 0, nH: 0 }, move: 1400, hold: 300, label: 'Hand and knee on the bench, back flat' },
      { spec: { nUA: -118, nFA: -4, nH: -4 }, move: 1000, hold: 600, label: 'Pull the weight up towards the hip, then lower' },
    ],
    highlight: ['nUA', 'nFA'],
    back: <><Floor /><Bench x1={36} x2={132} /></>,
    front: (f) => <Dumbbell f={f} />,
  },
  'fx-db-chest-press': {
    view: [20, 30, 160, 130],
    base: { hipX: 104, hipY: 114, torso: -90, head: -90, nLeg: [150, 150], fLeg: [148, 150], nFT: 90, fFT: 90, nH: 180, fH: 180 },
    frames: [
      { spec: { nUA: 8, nFA: 180, fUA: 6, fFA: 178, nH: 180 }, move: 1500, hold: 300, label: 'Lower slowly beside the chest' },
      { spec: { nUA: 180, nFA: 180, fUA: 178, fFA: 178, nH: 180 }, move: 1000, hold: 400, label: 'Press straight up over the chest' },
    ],
    highlight: ['nUA', 'nFA'],
    back: <><Floor /><Bench x1={40} x2={128} /></>,
    front: (f) => <Dumbbell f={f} />,
  },
  'fx-db-shoulder-press': {
    view: [20, -40, 160, 200],
    base: { ...seated, torso: 176, head: 178, nH: 180, fH: 180 },
    frames: [
      { spec: { nUA: 22, nFA: 172, fUA: 20, fFA: 170 }, move: 1500, hold: 300, label: 'Weights at shoulder height, back supported' },
      { spec: { nUA: 178, nFA: 180, fUA: 176, fFA: 178 }, move: 1100, hold: 400, label: 'Press overhead, then lower slowly' },
    ],
    highlight: ['nUA', 'nFA'],
    back: <><Floor /><Chair /></>,
    front: (f) => <Dumbbell f={f} />,
  },
  'fx-rdl': {
    view: [20, 0, 160, 160],
    base: { ...planted, nUA: 0, nFA: 0, nH: 0, fUA: 0, fFA: 0, fH: 0 },
    frames: [
      { spec: { hipX: 100, hipY: 76, torso: 180, head: 180 }, move: 1200, hold: 400, label: 'Stand tall, knees soft' },
      { spec: { hipX: 84, hipY: 82, torso: 104, head: 100 }, move: 1600, hold: 400, label: 'Hinge at the hips with a flat back, weights along the legs' },
    ],
    highlight: ['nTH', 'torso'],
    back: <Floor />,
    front: (f) => <Dumbbell f={f} />,
  },
  'fx-curl': {
    view: [40, 0, 130, 160],
    base: { ...standing, nUA: 2, nH: 0 },
    frames: [
      { spec: { nFA: 2, nH: 2 }, move: 1500, hold: 300, label: 'Elbows at your sides' },
      { spec: { nFA: 168, nH: 168 }, move: 1000, hold: 400, label: 'Curl up, then lower slowly' },
    ],
    highlight: ['nFA'],
    back: <Floor />,
    front: (f) => <Dumbbell f={f} />,
  },

  /* Strength: gym */
  'fx-leg-press': {
    view: [10, 30, 180, 130],
    base: { hipX: 70, hipY: 124, torso: -132, head: -128, nUA: 20, nFA: 70, nH: 70, fUA: 18, fFA: 68, fH: 68, nFT: 200, fFT: 200 },
    frames: [
      { spec: { nLeg: [138, 94], fLeg: [136, 95] }, move: 1400, hold: 300, label: 'Back flat on the pad, press away' },
      { spec: { nLeg: [112, 106], fLeg: [110, 107] }, move: 1600, hold: 200, label: 'Lower until the knees are about at a right angle' },
    ],
    highlight: ['nTH', 'fTH'],
    back: (
      <g stroke={PROP} strokeWidth={3} strokeLinecap="round">
        <line x1={30} y1={FLOOR} x2={190} y2={FLOOR} strokeWidth={2} />
        <line x1={40} y1={90} x2={74} y2={132} />
        <line x1={60} y1={132} x2={90} y2={132} />
        <line x1={74} y1={132} x2={74} y2={FLOOR} />
        <line x1={120} y1={140} x2={180} y2={70} strokeDasharray="4 5" />
      </g>
    ),
    front: (f) => {
      const d = dir(113 + 90)
      const a = f.n.ankle
      return <line x1={a.x - d.x * 16} y1={a.y - d.y * 16} x2={a.x + d.x * 22} y2={a.y + d.y * 22} stroke={PROP} strokeWidth={5} strokeLinecap="round" />
    },
  },
  'fx-leg-curl': {
    view: [20, 40, 170, 120],
    base: { ...seated, torso: 170, nUA: 20, nFA: 60, fUA: 18, fFA: 58, nTH: 90, fTH: 88 },
    frames: [
      { spec: { nSH: 90, fSH: 88, nFT: 180, fFT: 178 }, move: 1500, hold: 300, label: 'Legs out straight, pad behind the ankles' },
      { spec: { nSH: -10, fSH: -12, nFT: 80, fFT: 78 }, move: 1100, hold: 400, label: 'Curl the pad towards you, then return slowly' },
    ],
    highlight: ['nSH', 'nTH'],
    back: <><Floor /><Chair /></>,
    front: (f) => <circle cx={f.n.ankle.x} cy={f.n.ankle.y + 5} r={5} fill={PROP_FILL} stroke={PROP} strokeWidth={2} />,
  },
  'fx-lat-pulldown': {
    view: [20, -40, 160, 200],
    base: { ...seated, torso: 174, head: 178, nH: 180, fH: 180 },
    frames: [
      { spec: { nUA: 172, nFA: 174, fUA: 170, fFA: 172 }, move: 1500, hold: 300, label: 'Sit tall, arms up on the bar' },
      { spec: { nUA: 14, nFA: 176, fUA: 12, fFA: 174 }, move: 1000, hold: 400, label: 'Pull the bar down to the top of the chest' },
    ],
    highlight: ['nUA', 'nFA'],
    back: <><Floor /><Chair /></>,
    front: (f) => <Cable f={f} to={{ x: f.n.hand.x, y: -40 }} />,
  },
  'fx-seated-row': {
    view: [20, 20, 180, 140],
    base: { ...seated, torso: 178, head: 180, nLeg: [150, 134], fLeg: [148, 134], nFT: 170, fFT: 170 },
    frames: [
      { spec: { torso: 172, nArm: [150, 88], fArm: [148, 88] }, move: 1400, hold: 300, label: 'Sit tall, arms out straight' },
      { spec: { torso: 182, nArm: [92, 92], fArm: [90, 92] }, move: 1000, hold: 400, label: 'Pull the handle to your belly, squeeze the shoulder blades' },
    ],
    highlight: ['nUA', 'nFA'],
    back: <><Floor /><Bench x1={40} x2={100} /><line x1={164} y1={90} x2={164} y2={FLOOR} stroke={PROP} strokeWidth={4} /></>,
    front: (f) => <Cable f={f} to={{ x: 164, y: 92 }} />,
  },
  'fx-back-squat': {
    view: [20, 0, 160, 160],
    base: { ...planted, nUA: -40, nFA: -168, nH: -168, fUA: -38, fFA: -166, fH: -166 },
    frames: [
      { spec: { hipX: 100, hipY: 76, torso: 180, head: 180 }, move: 1000, hold: 400, label: 'Bar across the upper back' },
      { spec: { hipX: 80, hipY: 110, torso: 146, head: 154 }, move: 1500, hold: 400, label: 'Squat down with the chest up, then stand' },
    ],
    highlight: ['nTH', 'fTH'],
    back: <Floor />,
    front: (f) => <Plate at={{ x: f.shoulder.x - 12, y: f.shoulder.y + 1 }} />,
  },
  'fx-deadlift': {
    view: [20, 0, 160, 160],
    base: { ...planted, nArm: [108, 137], fArm: [106, 137], nH: 0, fH: 0 },
    frames: [
      { spec: { hipX: 74, hipY: 106, torso: 112, head: 104, nArm: [108, 137], fArm: [106, 137] }, move: 1500, hold: 400, label: 'Bar over the mid-foot, flat back, grip it' },
      { spec: { hipX: 100, hipY: 76, torso: 180, head: 180, nArm: [101, 82], fArm: [99, 82] }, move: 1400, hold: 400, label: 'Stand up by pushing the floor away' },
    ],
    highlight: ['nTH', 'torso'],
    back: <Floor />,
    front: (f) => <Plate at={f.n.wrist} r={17} />,
  },
  'fx-overhead-press': {
    view: [20, -50, 160, 210],
    base: { ...standing, nH: 180, fH: 180 },
    frames: [
      { spec: { nUA: 24, nFA: 170, fUA: 22, fFA: 168 }, move: 1500, hold: 300, label: 'Bar at the front of the shoulders' },
      { spec: { nUA: 178, nFA: 180, fUA: 176, fFA: 178 }, move: 1100, hold: 400, label: 'Press overhead, then lower' },
    ],
    highlight: ['nUA', 'nFA'],
    back: <Floor />,
    front: (f) => <Plate at={f.n.wrist} />,
  },

  /* Cardio */
  'fx-walk': {
    view: [30, 0, 140, 160],
    base: { ...standing, torso: 182, head: 182 },
    frames: [
      { spec: { hipY: 77, nTH: 22, nSH: 6, fTH: -16, fSH: -34, nUA: -16, nFA: -8, fUA: 18, fFA: 34 }, move: 550, label: 'Walk at a pace where you can talk but not sing' },
      { spec: { hipY: 75, nTH: -16, nSH: -34, fTH: 22, fSH: 6, nUA: 18, nFA: 34, fUA: -16, fFA: -8 }, move: 550, label: 'Walk at a pace where you can talk but not sing' },
    ],
    highlight: ['nTH', 'nSH'],
    back: <Floor />,
  },
  'fx-cycle': {
    view: [30, 20, 150, 140],
    base: { hipX: 88, hipY: 84, torso: 152, head: 140, nArm: [134, 80], fArm: [132, 81], nH: 100, fH: 100, nFT: 110, fFT: 110 },
    frames: pedals.map((p, i) => ({ spec: { nLeg: p, fLeg: pedals[(i + 4) % 8] }, move: 260, label: 'Steady, comfortable pedalling' })),
    highlight: ['nTH', 'nSH'],
    back: (
      <g stroke={PROP} strokeWidth={4} strokeLinecap="round" fill="none">
        <line x1={50} y1={FLOOR} x2={160} y2={FLOOR} strokeWidth={2} />
        <line x1={78} y1={88} x2={100} y2={88} />
        <line x1={90} y1={90} x2={114} y2={134} />
        <line x1={114} y1={134} x2={140} y2={84} />
        <line x1={132} y1={80} x2={146} y2={78} />
        <line x1={114} y1={134} x2={86} y2={FLOOR} />
        <line x1={114} y1={134} x2={144} y2={FLOOR} />
        <circle cx={114} cy={134} r={14} strokeWidth={1.5} strokeDasharray="3 4" />
      </g>
    ),
  },
  'fx-elliptical': {
    view: [30, 0, 150, 160],
    base: { ...standing, hipX: 98, hipY: 74, torso: 178, nH: 60, fH: 60 },
    frames: ellipse.map((p, i) => {
      const other = ellipse[(i + 3) % 6]
      const swing = Math.sin((i / 6) * 2 * Math.PI)
      return { spec: { nLeg: p, fLeg: other, nArm: [126 + swing * 10, 62], fArm: [126 - swing * 10, 62] }, move: 300, label: 'Stand tall, smooth strides' }
    }),
    highlight: ['nTH', 'nSH'],
    back: (
      <g stroke={PROP} strokeWidth={3} strokeLinecap="round" fill="none">
        <line x1={50} y1={FLOOR} x2={170} y2={FLOOR} strokeWidth={2} />
        <line x1={150} y1={FLOOR} x2={146} y2={40} strokeWidth={4} />
        <ellipse cx={106} cy={147} rx={19} ry={7} strokeWidth={1.5} strokeDasharray="3 4" />
      </g>
    ),
  },
  'fx-swim': {
    view: [0, 50, 200, 100],
    base: { hipX: 70, hipY: 100, torso: 90, head: 96, nSH: -90, fSH: -90, nFT: -90, fFT: -90, nH: undefined, fH: undefined },
    // The arm's last position (−270) is the first (90) turned once round: the 1 ms step back is invisible.
    frames: [
      { spec: { nUA: 90, nFA: 90, fUA: 270, fFA: 270, nTH: -86, fTH: -94, nSH: -86, fSH: -94 }, move: 1, label: 'Easy, steady strokes; breathe to the side' },
      { spec: { nUA: 0, nFA: 10, fUA: 180, fFA: 170, nTH: -94, fTH: -86, nSH: -94, fSH: -86 }, move: 500, label: 'Easy, steady strokes; breathe to the side' },
      { spec: { nUA: -90, nFA: -80, fUA: 90, fFA: 90, nTH: -86, fTH: -94, nSH: -86, fSH: -94 }, move: 500, label: 'Easy, steady strokes; breathe to the side' },
      { spec: { nUA: -180, nFA: -190, fUA: 0, fFA: 10, nTH: -94, fTH: -86, nSH: -94, fSH: -86 }, move: 500, label: 'Easy, steady strokes; breathe to the side' },
      { spec: { nUA: -270, nFA: -270, fUA: -90, fFA: -80, nTH: -86, fTH: -94, nSH: -86, fSH: -94 }, move: 500, label: 'Easy, steady strokes; breathe to the side' },
    ],
    highlight: ['nUA', 'nFA'],
    back: <Water />,
  },
  'fx-jog': {
    view: [30, 0, 140, 160],
    base: { ...standing, torso: 186, head: 184 },
    frames: [
      { spec: { hipY: 74, nTH: 34, nSH: -8, fTH: -22, fSH: -70, nUA: -30, nFA: 60, fUA: 30, fFA: 120 }, move: 330, label: 'An easy pace you could keep talking at' },
      { spec: { hipY: 78, nTH: -22, nSH: -70, fTH: 34, fSH: -8, nUA: 30, nFA: 120, fUA: -30, fFA: 60 }, move: 330, label: 'An easy pace you could keep talking at' },
    ],
    highlight: ['nTH', 'nSH'],
    back: <Floor />,
  },
  'fx-rowing': {
    view: [0, 40, 200, 120],
    base: { hipY: 128, hipX: 92, nLeg: [132, 132], fLeg: [130, 132], nFT: 170, fFT: 170, nH: 90, fH: 90 },
    frames: [
      { spec: { hipX: 92, torso: 150, head: 140, nArm: [128, 112], fArm: [126, 112] }, move: 1300, hold: 200, label: 'Slide forward: knees up, arms long' },
      { spec: { hipX: 60, torso: 196, head: 186, nArm: [66, 104], fArm: [64, 104] }, move: 900, hold: 300, label: 'Push with the legs, lean back, pull to the ribs' },
    ],
    highlight: ['nTH', 'nUA'],
    back: (
      <g stroke={PROP} strokeWidth={3} strokeLinecap="round">
        <line x1={10} y1={FLOOR} x2={190} y2={FLOOR} strokeWidth={2} />
        <line x1={30} y1={134} x2={170} y2={134} />
        <line x1={40} y1={134} x2={40} y2={FLOOR} />
        <line x1={160} y1={134} x2={160} y2={FLOOR} />
        <circle cx={168} cy={116} r={12} fill={PROP_FILL} />
      </g>
    ),
    front: (f) => <Cable f={f} to={{ x: 160, y: 116 }} />,
  },

  /* Mobility */
  'fx-hip-flexor-stretch': {
    view: [20, 20, 160, 140],
    base: { ...standing, hipX: 88, hipY: 112, torso: 180, head: 180, nSH: -90, nFT: -90, fLeg: [128, 150], fFT: 90, nUA: 4, nFA: 6, fUA: -4, fFA: 2 },
    frames: [
      { spec: { hipX: 88, hipY: 112, nTH: legsFor(88, 112, { x: 84, y: 150 }), torso: 180 }, move: 1300, hold: 400, label: 'Half-kneeling, back knee on a cushion' },
      { spec: { hipX: 98, hipY: 114, nTH: legsFor(98, 114, { x: 84, y: 150 }), torso: 184 }, move: 1300, hold: 2400, label: 'Tuck the pelvis under and shift forward — feel it at the front of the hip' },
    ],
    highlight: ['nTH'],
    back: <Mat x1={30} x2={170} />,
  },
  'fx-hamstring-stretch': {
    view: [30, 0, 170, 160],
    base: { ...standing, hipX: 96, nTH: 60, nSH: 60, nFT: 150, nUA: 40, nFA: 40, fUA: 36, fFA: 36 },
    frames: [
      { spec: { torso: 180, head: 180, nUA: 20, nFA: 20, fUA: 16, fFA: 16 }, move: 1300, hold: 400, label: 'Heel on a low step, leg straight' },
      { spec: { torso: 140, head: 140, nUA: 64, nFA: 64, fUA: 60, fFA: 60 }, move: 1500, hold: 2400, label: 'Lean forward from the hips, back straight — hold' },
    ],
    highlight: ['nTH', 'nSH'],
    back: <><Floor /><Step x1={150} x2={196} y={118} /></>,
  },
  'fx-open-book': {
    view: [0, 30, 200, 130],
    base: { hipX: 0, hipY: 0, p: 0 },
    frames: [
      { spec: { p: 0 }, move: 1600, hold: 400, label: 'Lying on your side, knees bent, arms together' },
      { spec: { p: 1 }, move: 1800, hold: 1200, label: 'Open the top arm across, following it with your eyes' },
    ],
    note: 'Seen from above',
    draw: (s) => {
      const p = s.p ?? 0
      const shoulder = { x: 100, y: 96 }
      const a = 90 + 180 * p // from pointing right (the other arm) round to the left
      const d = dir(a)
      const hand = { x: shoulder.x + d.x * 48, y: shoulder.y - Math.abs(d.y) * 0 + d.y * 48 }
      return (
        <g strokeLinecap="round" fill="none">
          <path d="M60 110 L140 110" stroke={INK} strokeWidth={14} opacity={0.35} />
          <line x1={140} y1={110} x2={164} y2={132} stroke={INK} strokeWidth={8} opacity={0.35} />
          <circle cx={76} cy={96} r={11} fill={INK} />
          <line x1={shoulder.x} y1={shoulder.y} x2={shoulder.x + 48} y2={shoulder.y} stroke={INK} strokeWidth={7} opacity={0.35} />
          <path d={`M${shoulder.x + 48} ${shoulder.y} A48 48 0 0 0 ${hand.x} ${hand.y}`} stroke={ACCENT} strokeWidth={2} strokeDasharray="3 4" opacity={0.7} />
          <line x1={shoulder.x} y1={shoulder.y} x2={hand.x} y2={hand.y} stroke={ACCENT} strokeWidth={8} />
        </g>
      )
    },
  },
  'fx-child-pose': {
    view: [0, 60, 200, 100],
    base: { ...fours, nLeg: undefined, fLeg: undefined, nFT: -90, fFT: -90, nSH: -90, fSH: -90, nH: 90, fH: 90 },
    frames: [
      { spec: { hipX: 62, hipY: 112, torsoAt: [106, 101], head: 100, nTH: 0, fTH: 2, nArm: [106, 150], fArm: [104, 150] }, move: 1400, hold: 400, label: 'On hands and knees' },
      { spec: { hipX: 32, hipY: 131, torsoAt: [80, 144], head: 96, nTH: 58, fTH: 58, nArm: [122, 150], fArm: [120, 150] }, move: 2000, hold: 3000, label: 'Sit back towards the heels, reach forward, forehead down — breathe' },
    ],
    highlight: ['torso'],
    back: <Mat x1={10} x2={170} />,
  },
}
