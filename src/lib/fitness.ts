import type { Exercise, Injury, RehabSession, Workout } from '../db/db'
import { adjustments } from './plan'

/**
 * Fitness alongside recovery. Each fitness exercise says how it sits with an injury elsewhere: `adjust` (how to do
 * it more comfortably) or `avoid` (ask a physio first — heavy spinal loading with a disc problem, weight overhead
 * with a neck problem, running on an injured knee). Rehab exercises bring their own adjustments (lib/guide.ts).
 */

type RegionNotes = Partial<Record<string, string>>
interface Caution {
  avoid?: RegionNotes
  adjust?: RegionNotes
}

const KNEEL = 'Kneeling presses on the knee: put a folded towel or pillow under it, and skip it if kneeling hurts.'
const HEAD = 'Keep your head in line with your body — look at the floor.'
const GRIP = 'Gripping loads the elbow and forearm tendons: go lighter, and stop if the outer elbow hurts.'
const grip = { Elbow: GRIP, Forearm: GRIP, Wrist: GRIP }
const DEPTH = 'Only go as deep as is comfortable — a chair behind you as a target helps.'
const NECK_OVERHEAD = 'Pressing weight overhead loads the neck — ask your physio first.'

export const CAUTIONS: Record<string, Caution> = {
  'fx-sit-to-stand': { adjust: { Knee: 'Use a higher chair, or push off with your hands, if the knee complains.' } },
  'fx-squat': { adjust: { Knee: DEPTH, 'Lower back': 'Chest up and back straight; stop before your back rounds.' } },
  'fx-lunge': { adjust: { Knee: 'Short steps with the front knee over the foot; skip it if kneecap pain flares.', Ankle: 'Hold a wall for balance.', Hip: 'Short steps, and only as low as is comfortable.' } },
  'fx-pushup': {
    adjust: { Elbow: 'Start against a wall or kitchen counter to take weight off the elbows and wrists.', Forearm: 'Start against a wall or kitchen counter to take weight off the forearms.', Wrist: 'Push up on your fists, or against a wall, to keep the wrists straight.', Shoulder: 'Lower only as far as is comfortable.', Neck: HEAD, 'Lower back': 'Keep a straight line; drop to your knees if your back sags.' },
  },
  'fx-plank': { adjust: { 'Lower back': 'Start from your knees, and stop if your back aches.', Elbow: 'Forearm planks press on the elbows — use a cushion, or plank on your hands against a counter.', Shoulder: 'Start from your knees, or against a counter.', Neck: HEAD } },
  'fx-side-plank': { adjust: { Shoulder: 'Start from your knees, and only hold while it’s comfortable.', Elbow: 'Put a cushion under the elbow.', 'Lower back': 'Start from your knees.' } },
  'fx-crunch': {
    avoid: { 'Lower back': 'Repeated bending forward can aggravate a disc problem — ask your physio first. A dead bug or plank trains the same muscles more gently.', Neck: 'Curling up strains a sore neck — ask your physio first; a dead bug is gentler.' },
  },
  'fx-superman': { adjust: { 'Lower back': 'Lift only a little, and stop if pain runs down a leg.', Neck: 'Keep looking at the floor rather than lifting the head.' } },
  'fx-goblet-squat': { adjust: { Knee: DEPTH, 'Lower back': 'Keep the weight light and your back straight.', Elbow: 'Holding the dumbbell loads the forearm — go lighter.', Forearm: 'Holding the dumbbell loads the forearm — go lighter.', Wrist: 'Hold the dumbbell by its ends, close to the chest.' } },
  'fx-db-row': { adjust: { 'Lower back': 'Support yourself with a hand and knee on a bench, back flat.', Shoulder: 'Pull only as high as is comfortable.', ...grip } },
  'fx-db-chest-press': { adjust: { Shoulder: 'Lower only as far as is comfortable — pressing from the floor limits the range for you.', ...grip } },
  'fx-db-shoulder-press': { avoid: { Neck: NECK_OVERHEAD }, adjust: { Shoulder: 'Press only as high as is comfortable.', 'Lower back': 'Sit with your back supported.', ...grip } },
  'fx-rdl': { avoid: { 'Lower back': 'Bending forward with weight loads the lower back discs — ask your physio before starting it.' }, adjust: { Knee: 'Keep the knees soft.', ...grip } },
  'fx-curl': { adjust: { Elbow: 'Curl with palms facing each other (a hammer grip), go light, and stop if the outer elbow hurts.', Forearm: GRIP, Wrist: 'Keep the wrists straight.' } },
  'fx-leg-press': { adjust: { Knee: 'Keep the knee bend to about a right angle.', 'Lower back': 'Keep your lower back flat on the pad; stop before your hips curl up.' } },
  'fx-leg-curl': { adjust: { Knee: 'Light weight, and only the part of the range that’s pain-free.' } },
  'fx-lat-pulldown': { adjust: { Neck: 'Pull the bar to your chest, never behind the neck.', Shoulder: 'Use a comfortable grip width, and don’t let the shoulders shrug up.', ...grip } },
  'fx-seated-row': { adjust: { 'Lower back': 'Sit tall and don’t rock back and forth.', ...grip } },
  'fx-back-squat': {
    avoid: { 'Lower back': 'A bar on the back compresses the spine — ask your physio first. A goblet squat or leg press is gentler.', Neck: 'The bar rests near the neck — ask your physio first.' },
    adjust: { Knee: DEPTH, Shoulder: 'Holding the bar behind the neck strains the shoulders — a goblet squat is easier.' },
  },
  'fx-deadlift': { avoid: { 'Lower back': 'Lifting from the floor loads the lower back discs heavily — ask your physio first.' }, adjust: { Knee: 'Start with the bar raised on blocks.', ...grip } },
  'fx-overhead-press': {
    avoid: { Neck: NECK_OVERHEAD, 'Lower back': 'Pressing overhead standing tends to arch the lower back — ask your physio first; a seated dumbbell press with back support is gentler.' },
    adjust: { Shoulder: 'Press only as high as is comfortable.', ...grip },
  },
  'fx-walk': { adjust: { Knee: 'Flat routes and cushioned shoes; build the time up gradually.', Ankle: 'Flat, even ground and supportive shoes.' } },
  'fx-cycle': { adjust: { Knee: 'Raise the seat so the knee stays a little bent at the bottom, and keep the resistance low.', 'Lower back': 'An upright or recumbent bike is easiest on the back.' } },
  'fx-elliptical': { adjust: { Knee: 'Low resistance and short strides.' } },
  'fx-swim': { adjust: { Neck: 'Head-up breaststroke strains the neck — front crawl with a snorkel, or backstroke, is easier.', Shoulder: 'Easy strokes; backstroke is often most comfortable.', 'Lower back': 'Avoid arching with head-up breaststroke.' } },
  'fx-jog': {
    avoid: { Knee: 'Running puts two to three times your body weight through the knee each step — ask your physio first. Walking, cycling or the elliptical build fitness meanwhile.' },
    adjust: { Ankle: 'Flat, even ground and supportive shoes.', 'Lower back': 'Soft surfaces and short runs; stop if pain runs down a leg.' },
  },
  'fx-rowing': { avoid: { 'Lower back': 'The repeated bending loads the lower back — ask your physio first.' }, adjust: { Knee: 'Don’t slide all the way forward if deep knee bends hurt.', ...grip } },
  'fx-hip-flexor-stretch': { adjust: { Knee: KNEEL, 'Lower back': 'Tuck the pelvis under; don’t arch the back.' } },
  'fx-hamstring-stretch': { adjust: { 'Lower back': 'Bend from the hips with a straight back, and stop if it causes tingling down the leg.' } },
  'fx-open-book': { adjust: { Shoulder: 'Open only as far as is comfortable.', Neck: 'Let the head rest on a pillow and turn only a little.' } },
  'fx-child-pose': { adjust: { Knee: KNEEL, 'Lower back': 'If bending forward sends pain down a leg, skip it.' } },
}

export interface CautionNote {
  level: 'avoid' | 'adjust'
  region: string
  injury: Injury
  note: string
}

/** What to watch with this exercise given the open injuries: "ask your physio first" before "adjust", one per region. */
export function cautionsFor(exerciseId: string, injuries: Injury[]): CautionNote[] {
  const c = CAUTIONS[exerciseId]
  const out = new Map<string, CautionNote>()
  for (const injury of injuries) {
    if (out.has(injury.bodyRegion)) continue
    const avoid = c?.avoid?.[injury.bodyRegion]
    const adjust = c?.adjust?.[injury.bodyRegion]
    if (avoid) out.set(injury.bodyRegion, { level: 'avoid', region: injury.bodyRegion, injury, note: avoid })
    else if (adjust) out.set(injury.bodyRegion, { level: 'adjust', region: injury.bodyRegion, injury, note: adjust })
  }
  // Rehab exercises: their own adjustments for injuries they aren't for
  for (const a of adjustments(exerciseId, injuries)) if (!out.has(a.region)) out.set(a.region, { level: 'adjust', ...a })
  return [...out.values()].sort((a, b) => (a.level === b.level ? 0 : a.level === 'avoid' ? -1 : 1))
}

/** Starter workouts to add in one tap (the user then edits them). */
export const STARTER_WORKOUTS: Pick<Workout, 'name' | 'items' | 'restSeconds'>[] = [
  {
    name: 'Gentle full body (home)',
    restSeconds: 60,
    items: [
      { exerciseId: 'fx-sit-to-stand', sets: 3, target: 10 },
      { exerciseId: 'fx-pushup', sets: 3, target: 8 },
      { exerciseId: 'ex-bird-dog', sets: 2, target: 10 },
      { exerciseId: 'ex-glute-bridge', sets: 3, target: 12 },
      { exerciseId: 'fx-plank', sets: 3, target: 20 },
      { exerciseId: 'fx-walk', sets: 1, target: 900 },
    ],
  },
  {
    name: 'Low-impact cardio',
    restSeconds: 60,
    items: [
      { exerciseId: 'fx-cycle', sets: 1, target: 1200 },
      { exerciseId: 'fx-elliptical', sets: 1, target: 600 },
    ],
  },
  {
    name: 'Gym: lower body',
    restSeconds: 90,
    items: [
      { exerciseId: 'fx-leg-press', sets: 3, target: 10 },
      { exerciseId: 'fx-leg-curl', sets: 3, target: 10 },
      { exerciseId: 'fx-goblet-squat', sets: 3, target: 8 },
      { exerciseId: 'ex-calf-raise', sets: 3, target: 15 },
    ],
  },
  {
    name: 'Gym: upper body',
    restSeconds: 90,
    items: [
      { exerciseId: 'fx-lat-pulldown', sets: 3, target: 10 },
      { exerciseId: 'fx-seated-row', sets: 3, target: 10 },
      { exerciseId: 'fx-db-chest-press', sets: 3, target: 10 },
      { exerciseId: 'fx-db-shoulder-press', sets: 3, target: 8 },
    ],
  },
]

/* ─────────── a workout's numbers ─────────── */

export interface Bests {
  /** Heaviest weight lifted for at least one rep, kg */
  heaviest?: number
  /** Most reps (or longest hold, seconds) in one set */
  most?: number
}

/** Personal bests for one exercise across finished sessions. */
export function bestsFor(sessions: Pick<RehabSession, 'items' | 'deletedAt'>[], exerciseId: string): Bests {
  const sets = sessions.filter((s) => !s.deletedAt).flatMap((s) => s.items.filter((i) => i.exerciseId === exerciseId).flatMap((i) => i.sets.filter((x) => x.done)))
  const loads = sets.flatMap((x) => (x.load ? [x.load] : []))
  return { heaviest: loads.length ? Math.max(...loads) : undefined, most: sets.length ? Math.max(...sets.map((x) => x.amount)) : undefined }
}

/**
 * New personal bests in a just-finished session, against everything before it. The first time doing an exercise
 * isn't a "best" yet — there's nothing to beat.
 */
export function newBests(before: Pick<RehabSession, 'items' | 'deletedAt'>[], session: Pick<RehabSession, 'items'>, exercises: Map<string, Pick<Exercise, 'name' | 'mode'>>) {
  const out: string[] = []
  for (const item of session.items) {
    const prev = bestsFor(before, item.exerciseId)
    if (prev.most === undefined) continue
    const now = bestsFor([session], item.exerciseId)
    const e = exercises.get(item.exerciseId)
    if (!e) continue
    if (now.heaviest && prev.heaviest && now.heaviest > prev.heaviest) out.push(`${e.name}: ${now.heaviest} kg`)
    else if (!now.heaviest && !prev.heaviest && now.most && now.most > prev.most) out.push(`${e.name}: ${now.most}${e.mode === 'time' ? ' s' : ' reps'}`)
  }
  return out
}
