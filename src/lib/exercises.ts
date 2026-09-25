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

type Fitness = Pick<Exercise, 'name' | 'bodyRegion' | 'mode' | 'equipment' | 'instructions'> & { category: NonNullable<Exercise['category']> }
const fitness = (id: string, e: Fitness): Exercise => ({ id: `fx-${id}`, createdAt: T, updatedAt: T, builtin: true, ...e })

/**
 * General fitness, at home and in the gym, alongside rehab. How each one sits with an injury elsewhere (adjust, or
 * ask a physio first) is in lib/fitness.ts. General descriptions, not a programme.
 */
export const FITNESS_EXERCISES: Exercise[] = [
  // Strength: bodyweight
  fitness('sit-to-stand', { category: 'strength', name: 'Sit to stand', bodyRegion: 'Thigh', mode: 'reps', equipment: 'Chair', instructions: 'Sit near the front of a chair, feet flat. Stand up without using your hands, then sit back down slowly.' }),
  fitness('squat', { category: 'strength', name: 'Bodyweight squat', bodyRegion: 'Thigh', mode: 'reps', equipment: 'None', instructions: 'Feet shoulder-width apart. Sit the hips back and down as if onto a chair, chest up, then stand.' }),
  fitness('lunge', { category: 'strength', name: 'Reverse lunge', bodyRegion: 'Thigh', mode: 'reps', equipment: 'None', instructions: 'Step one foot back and lower the back knee towards the floor, front knee over the foot. Push back up.' }),
  fitness('pushup', { category: 'strength', name: 'Push-up', bodyRegion: 'Chest', mode: 'reps', equipment: 'None', instructions: 'Hands under the shoulders, body in a straight line. Lower the chest towards the floor, then push up. Easier on a wall or counter.' }),
  fitness('plank', { category: 'strength', name: 'Plank', bodyRegion: 'Abdomen', mode: 'time', equipment: 'Mat', instructions: 'On forearms and toes (or knees), body in a straight line from head to heels. Breathe and hold.' }),
  fitness('side-plank', { category: 'strength', name: 'Side plank', bodyRegion: 'Abdomen', mode: 'time', equipment: 'Mat', instructions: 'On one forearm, feet (or knees) stacked, lift the hips so the body is straight. Hold, then switch sides.' }),
  fitness('crunch', { category: 'strength', name: 'Crunch', bodyRegion: 'Abdomen', mode: 'reps', equipment: 'Mat', instructions: 'On your back, knees bent. Curl the shoulders off the floor, then lower slowly.' }),
  fitness('superman', { category: 'strength', name: 'Back extension (superman)', bodyRegion: 'Lower back', mode: 'reps', equipment: 'Mat', instructions: 'Lying face down, lift the chest and legs a little off the floor, hold 2 seconds, lower.' }),
  // Strength: dumbbells
  fitness('goblet-squat', { category: 'strength', name: 'Goblet squat', bodyRegion: 'Thigh', mode: 'reps', equipment: 'Dumbbell', instructions: 'Hold a dumbbell at your chest. Squat down with the chest up and knees over the toes, then stand.' }),
  fitness('db-row', { category: 'strength', name: 'One-arm dumbbell row', bodyRegion: 'Upper back', mode: 'reps', equipment: 'Dumbbell, bench', instructions: 'One hand and knee on a bench, back flat. Pull the dumbbell up towards the hip, then lower.' }),
  fitness('db-chest-press', { category: 'strength', name: 'Dumbbell chest press', bodyRegion: 'Chest', mode: 'reps', equipment: 'Dumbbells, bench or floor', instructions: 'Lying on a bench or the floor, press the dumbbells up over the chest, then lower slowly.' }),
  fitness('db-shoulder-press', { category: 'strength', name: 'Dumbbell shoulder press', bodyRegion: 'Shoulder', mode: 'reps', equipment: 'Dumbbells', instructions: 'Seated with back support, press the dumbbells from shoulder height overhead, then lower.' }),
  fitness('rdl', { category: 'strength', name: 'Romanian deadlift', bodyRegion: 'Thigh', mode: 'reps', equipment: 'Dumbbells', instructions: 'Knees soft, hinge at the hips with a flat back, lowering the weights along the legs. Stand by driving the hips forward.' }),
  fitness('curl', { category: 'strength', name: 'Biceps curl', bodyRegion: 'Upper arm', mode: 'reps', equipment: 'Dumbbells', instructions: 'Elbows at your sides, curl the dumbbells up, then lower slowly.' }),
  // Strength: gym
  fitness('leg-press', { category: 'strength', name: 'Leg press', bodyRegion: 'Thigh', mode: 'reps', equipment: 'Machine', instructions: 'Back flat on the pad, feet shoulder-width. Lower until the knees are about at a right angle, then press away.' }),
  fitness('leg-curl', { category: 'strength', name: 'Leg curl', bodyRegion: 'Thigh', mode: 'reps', equipment: 'Machine', instructions: 'Curl the pad towards you by bending the knees, then return slowly.' }),
  fitness('lat-pulldown', { category: 'strength', name: 'Lat pulldown', bodyRegion: 'Upper back', mode: 'reps', equipment: 'Machine', instructions: 'Sit tall, pull the bar down to the top of the chest, then let it rise slowly.' }),
  fitness('seated-row', { category: 'strength', name: 'Seated cable row', bodyRegion: 'Upper back', mode: 'reps', equipment: 'Machine', instructions: 'Sit tall, pull the handle to your belly, squeezing the shoulder blades, then return slowly.' }),
  fitness('back-squat', { category: 'strength', name: 'Barbell back squat', bodyRegion: 'Thigh', mode: 'reps', equipment: 'Barbell, rack', instructions: 'Bar across the upper back, squat down with the chest up, then stand.' }),
  fitness('deadlift', { category: 'strength', name: 'Deadlift', bodyRegion: 'Lower back', mode: 'reps', equipment: 'Barbell', instructions: 'Bar over the mid-foot, hinge down with a flat back, grip it, and stand up by pushing the floor away.' }),
  fitness('overhead-press', { category: 'strength', name: 'Barbell overhead press', bodyRegion: 'Shoulder', mode: 'reps', equipment: 'Barbell', instructions: 'Standing, press the bar from the front of the shoulders to overhead, then lower.' }),
  // Cardio (time)
  fitness('walk', { category: 'cardio', name: 'Brisk walk', bodyRegion: 'Other', mode: 'time', equipment: 'None', instructions: 'Walk at a pace where you can talk but not sing.' }),
  fitness('cycle', { category: 'cardio', name: 'Cycling (stationary)', bodyRegion: 'Other', mode: 'time', equipment: 'Exercise bike', instructions: 'Seat high enough that the knee stays a little bent at the bottom. Steady, comfortable effort.' }),
  fitness('elliptical', { category: 'cardio', name: 'Elliptical trainer', bodyRegion: 'Other', mode: 'time', equipment: 'Machine', instructions: 'Stand tall, smooth strides, steady effort.' }),
  fitness('swim', { category: 'cardio', name: 'Swimming', bodyRegion: 'Other', mode: 'time', equipment: 'Pool', instructions: 'Easy, steady lengths with rests as needed.' }),
  fitness('jog', { category: 'cardio', name: 'Jogging', bodyRegion: 'Other', mode: 'time', equipment: 'Good shoes', instructions: 'An easy pace you could keep talking at; start with walk–jog intervals.' }),
  fitness('rowing', { category: 'cardio', name: 'Rowing machine', bodyRegion: 'Other', mode: 'time', equipment: 'Machine', instructions: 'Push with the legs first, then lean back slightly and pull the handle to the ribs.' }),
  // Mobility
  fitness('hip-flexor-stretch', { category: 'mobility', name: 'Hip flexor stretch', bodyRegion: 'Hip', mode: 'time', equipment: 'Mat', instructions: 'Half-kneeling, tuck the pelvis under and shift forward until you feel a stretch at the front of the back hip.' }),
  fitness('hamstring-stretch', { category: 'mobility', name: 'Hamstring stretch', bodyRegion: 'Thigh', mode: 'time', equipment: 'None', instructions: 'Heel on a low step, leg straight, back straight; lean forward from the hips until you feel the stretch.' }),
  fitness('open-book', { category: 'mobility', name: 'Open book', bodyRegion: 'Upper back', mode: 'reps', equipment: 'Mat', instructions: 'Lying on your side, knees bent, open the top arm across to the other side, following it with your eyes.' }),
  fitness('child-pose', { category: 'mobility', name: 'Child’s pose', bodyRegion: 'Lower back', mode: 'time', equipment: 'Mat', instructions: 'Kneel, sit back towards the heels and reach the arms forward, forehead down. Breathe.' }),
]
