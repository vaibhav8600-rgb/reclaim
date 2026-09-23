import type { Exercise } from '../db/db'

/** Fixed timestamp so starter exercises merge cleanly between backups and devices. */
const T = Date.UTC(2026, 0, 1)

type Starter = Pick<Exercise, 'name' | 'bodyRegion' | 'mode' | 'equipment' | 'instructions'>

const starter = (id: string, e: Starter): Exercise => ({ id: `ex-${id}`, createdAt: T, updatedAt: T, builtin: true, ...e })

/**
 * A small starter library of common rehab exercises. Descriptions are general;
 * the user's clinician's prescription always wins.
 */
export const STARTER_EXERCISES: Exercise[] = [
  // Elbow, forearm, wrist, hand
  starter('wrist-ext-iso', { name: 'Isometric wrist extension', bodyRegion: 'Forearm', mode: 'time', equipment: 'None', instructions: 'Forearm supported, palm down. Press the back of your hand up into your other hand without letting it move. Hold steadily.' }),
  starter('wrist-ext-ecc', { name: 'Eccentric wrist extension', bodyRegion: 'Forearm', mode: 'reps', equipment: 'Dumbbell', instructions: 'Forearm on a table, palm down, weight in hand. Use the other hand to lift the wrist up, then lower slowly on your own over 3–4 seconds.' }),
  starter('grip-squeeze', { name: 'Grip squeeze', bodyRegion: 'Hand & fingers', mode: 'reps', equipment: 'Soft ball', instructions: 'Squeeze a soft ball firmly for 2–3 seconds, then relax fully.' }),
  starter('wrist-ext-stretch', { name: 'Wrist extensor stretch', bodyRegion: 'Forearm', mode: 'time', equipment: 'None', instructions: 'Arm straight in front, palm down. Gently bend the wrist down with the other hand until you feel a stretch on top of the forearm.' }),
  starter('wrist-flex-stretch', { name: 'Wrist flexor stretch', bodyRegion: 'Forearm', mode: 'time', equipment: 'None', instructions: 'Arm straight in front, palm up. Gently bend the wrist back with the other hand.' }),
  starter('pro-sup', { name: 'Forearm pronation & supination', bodyRegion: 'Forearm', mode: 'reps', equipment: 'Hammer or light weight', instructions: 'Elbow bent at your side, rotate the forearm slowly palm up, then palm down.' }),
  // Shoulder
  starter('pendulum', { name: 'Pendulum swings', bodyRegion: 'Shoulder', mode: 'time', equipment: 'None', instructions: 'Lean forward with support, let the arm hang and swing it in small, relaxed circles.' }),
  starter('shoulder-er-band', { name: 'Band external rotation', bodyRegion: 'Shoulder', mode: 'reps', equipment: 'Resistance band', instructions: 'Elbow at your side bent 90°. Rotate the forearm outward against the band, then return slowly.' }),
  starter('scap-squeeze', { name: 'Scapular squeeze', bodyRegion: 'Upper back', mode: 'reps', equipment: 'None', instructions: 'Sit or stand tall. Draw the shoulder blades back and down, hold 3 seconds, release.' }),
  starter('wall-slide', { name: 'Wall slides', bodyRegion: 'Shoulder', mode: 'reps', equipment: 'Wall', instructions: 'Forearms on a wall, slide the arms up as far as comfortable, then back down.' }),
  // Back & core
  starter('cat-cow', { name: 'Cat–cow', bodyRegion: 'Lower back', mode: 'reps', equipment: 'Mat', instructions: 'On hands and knees, slowly round the back up, then let it sag gently. Move with your breath.' }),
  starter('bird-dog', { name: 'Bird dog', bodyRegion: 'Lower back', mode: 'reps', equipment: 'Mat', instructions: 'On hands and knees, reach one arm and the opposite leg out long, keeping the back level. Alternate sides.' }),
  starter('glute-bridge', { name: 'Glute bridge', bodyRegion: 'Hip', mode: 'reps', equipment: 'Mat', instructions: 'Lying on your back, knees bent. Squeeze the glutes and lift the hips, hold 2 seconds, lower slowly.' }),
  starter('dead-bug', { name: 'Dead bug', bodyRegion: 'Abdomen', mode: 'reps', equipment: 'Mat', instructions: 'On your back, arms up, knees at 90°. Lower opposite arm and leg slowly, keeping the low back flat.' }),
  // Knee & hip
  starter('quad-set', { name: 'Quad sets', bodyRegion: 'Knee', mode: 'reps', equipment: 'None', instructions: 'Leg straight, tighten the thigh to press the back of the knee down. Hold 5 seconds, relax.' }),
  starter('slr', { name: 'Straight leg raise', bodyRegion: 'Knee', mode: 'reps', equipment: 'None', instructions: 'Lying down, tighten the thigh and lift the straight leg to the height of the other knee. Lower slowly.' }),
  starter('heel-slide', { name: 'Heel slides', bodyRegion: 'Knee', mode: 'reps', equipment: 'None', instructions: 'Lying down, slide the heel towards you to bend the knee as far as comfortable, then straighten.' }),
  starter('wall-sit', { name: 'Wall sit', bodyRegion: 'Knee', mode: 'time', equipment: 'Wall', instructions: 'Back against a wall, slide down to a comfortable knee bend and hold.' }),
  starter('step-up', { name: 'Step-ups', bodyRegion: 'Knee', mode: 'reps', equipment: 'Step', instructions: 'Step up onto a low step with control, then step back down.' }),
  starter('clamshell', { name: 'Clamshells', bodyRegion: 'Hip', mode: 'reps', equipment: 'Resistance band', instructions: 'Lying on your side, knees bent, open the top knee while keeping the feet together.' }),
  // Ankle & foot
  starter('ankle-alphabet', { name: 'Ankle alphabet', bodyRegion: 'Ankle', mode: 'reps', equipment: 'None', instructions: 'Trace the letters of the alphabet with your big toe, moving from the ankle.' }),
  starter('calf-raise', { name: 'Calf raises', bodyRegion: 'Shin & calf', mode: 'reps', equipment: 'None', instructions: 'Rise up onto your toes, pause, and lower slowly. Hold a support for balance.' }),
  starter('single-leg-balance', { name: 'Single-leg balance', bodyRegion: 'Ankle', mode: 'time', equipment: 'None', instructions: 'Stand on one leg near a support. Progress by closing your eyes or using a cushion.' }),
  // Neck
  starter('chin-tuck', { name: 'Chin tucks', bodyRegion: 'Neck', mode: 'reps', equipment: 'None', instructions: 'Sit tall and glide the chin straight back, making a “double chin”. Hold 3 seconds.' }),
]
