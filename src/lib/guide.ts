/**
 * The vetted side of the recovery plan: for each starter exercise, which injuries it suits, the dose range it's
 * normally given in, how it progresses, and the published clinical guideline it comes from. The AI only chooses
 * from these exercises and within these ranges; it never invents an exercise or a dose.
 *
 * Doses are typical starting ranges from rehab practice, not a prescription. The guidelines support the kind of
 * exercise for the condition (e.g. progressive loading for lateral elbow pain); the user's physio sets the details.
 */

export interface Guideline {
  short: string
  citation: string
}

export const GUIDELINES = {
  elbow: {
    short: 'Lateral elbow pain guideline (JOSPT, 2022)',
    citation: 'Lucado AM, Day JM, Vincent JI, et al. Lateral Elbow Pain and Muscle Function Impairments: Clinical Practice Guidelines. J Orthop Sports Phys Ther. 2022;52(12):CPG1–CPG111.',
  },
  shoulder: {
    short: 'Subacromial shoulder pain review (JOSPT, 2020)',
    citation: 'Pieters L, Lewis J, Kuppens K, et al. An Update of Systematic Reviews Examining the Effectiveness of Conservative Physical Therapy Interventions for Subacromial Shoulder Pain. J Orthop Sports Phys Ther. 2020;50(3):131–141.',
  },
  neck: {
    short: 'Neck pain guideline (JOSPT, 2017)',
    citation: 'Blanpied PR, Gross AR, Elliott JM, et al. Neck Pain: Revision 2017. J Orthop Sports Phys Ther. 2017;47(7):A1–A83.',
  },
  lowBack: {
    short: 'Low back pain guideline (JOSPT, 2021)',
    citation: 'George SZ, Fritz JM, Silfies SP, et al. Interventions for the Management of Acute and Chronic Low Back Pain: Revision 2021. J Orthop Sports Phys Ther. 2021;51(11):CPG1–CPG60.',
  },
  knee: {
    short: 'Osteoarthritis guideline (OARSI, 2019)',
    citation: 'Bannuru RR, Osani MC, Vaysbrot EE, et al. OARSI guidelines for the non-surgical management of knee, hip, and polyarticular osteoarthritis. Osteoarthritis Cartilage. 2019;27(11):1578–1589.',
  },
  patellofemoral: {
    short: 'Patellofemoral pain guideline (JOSPT, 2019)',
    citation: 'Willy RW, Hoglund LT, Barton CJ, et al. Patellofemoral Pain. J Orthop Sports Phys Ther. 2019;49(9):CPG1–CPG95.',
  },
  ankle: {
    short: 'Ankle sprain guideline (JOSPT, 2021)',
    citation: 'Martin RL, Davenport TE, Fraser JJ, et al. Ankle Stability and Movement Coordination Impairments: Lateral Ankle Ligament Sprains Revision 2021. J Orthop Sports Phys Ther. 2021;51(4):CPG1–CPG80.',
  },
  achilles: {
    short: 'Achilles tendinopathy guideline (JOSPT, 2018)',
    citation: 'Martin RL, Chimenti R, Cuddeford T, et al. Achilles Pain, Stiffness, and Muscle Power Deficits: Midportion Achilles Tendinopathy Revision 2018. J Orthop Sports Phys Ther. 2018;48(5):A1–A38.',
  },
  painMonitoring: {
    short: 'Pain-monitoring model (Am J Sports Med, 2007)',
    citation: 'Silbernagel KG, Thomeé R, Eriksson BI, Karlsson J. Continued sports activity, using a pain-monitoring model, during rehabilitation in patients with Achilles tendinopathy: a randomized controlled study. Am J Sports Med. 2007;35(6):897–906.',
  },
  protein: {
    short: 'Protein and exercise position stand (ISSN, 2017)',
    citation: 'Jäger R, Kerksick CM, Campbell BI, et al. International Society of Sports Nutrition Position Stand: protein and exercise. J Int Soc Sports Nutr. 2017;14:20.',
  },
  kneeLoad: {
    short: 'Weight loss and knee load (Arthritis Rheum, 2005)',
    citation: 'Messier SP, Gutekunst DJ, Davis C, DeVita P. Weight loss reduces knee-joint loads in overweight and obese older adults with knee osteoarthritis. Arthritis Rheum. 2005;52(7):2026–2032.',
  },
  peg: {
    short: 'PEG pain scale (J Gen Intern Med, 2009)',
    citation: 'Krebs EE, Lorenz KA, Bair MJ, et al. Development and initial validation of the PEG, a three-item scale assessing pain intensity and interference. J Gen Intern Med. 2009;24(6):733–738.',
  },
  psfs: {
    short: 'Patient-Specific Functional Scale (Physiother Can, 1995)',
    citation: 'Stratford P, Gill C, Westaway M, Binkley J. Assessing disability and change on individual patients: a report of a patient specific measure. Physiother Can. 1995;47(4):258–263.',
  },
  water: {
    short: 'Dietary reference values for water (EFSA, 2010)',
    citation: 'EFSA Panel on Dietetic Products, Nutrition, and Allergies. Scientific Opinion on Dietary Reference Values for water. EFSA Journal. 2010;8(3):1459.',
  },
} satisfies Record<string, Guideline>

export type GuidelineId = keyof typeof GUIDELINES

type Range = [min: number, max: number]

export interface ExerciseGuide {
  /** Injury body regions (as in BODY_REGIONS) this exercise is used for. */
  for: string[]
  sets: Range
  /** Reps per set, or seconds per set for timed exercises. */
  target: Range
  timesPerDay: Range
  daysPerWeek: Range
  progression: string
  caution?: string
  /**
   * How to adjust it for an injury elsewhere (by body region), e.g. kneeling on a sore knee. Shown when that region
   * has an open injury the exercise isn't for, so one plan works across several injuries.
   * ponytail: notes only; add an "avoid" level when the fitness library brings loaded lifts (squats, presses).
   */
  adjust?: Partial<Record<string, string>>
  refs: GuidelineId[]
}

// Shared adjustments
const KNEEL = 'Kneeling presses on the knee: put a folded towel or pillow under it, and skip it if kneeling hurts.'
const HANDS = 'Your weight goes through your hands: keep the elbows soft, or rest on your fists or forearms if the elbow or wrist complains.'
const HEAD_DOWN = 'Keep your head in line with your back — look at the floor, not ahead.'
const NO_GRIP = 'Don’t hold weights in your hands; wear a backpack or hold a rail lightly instead.'
const ARM_REST = 'Rest your forearm on a table or your thigh so the shoulder and neck stay relaxed.'
const PILLOW = 'Put a pillow under your head so your neck stays level.'

/** Keyed by starter exercise id (see STARTER_EXERCISES). */
export const EXERCISE_GUIDES: Record<string, ExerciseGuide> = {
  'ex-wrist-ext-iso': { for: ['Elbow', 'Forearm', 'Wrist'], sets: [3, 5], target: [30, 45], timesPerDay: [1, 2], daysPerWeek: [5, 7], progression: 'Press harder, up to a firm effort that stays at or below 3/10 pain.', caution: 'A good choice when pain is high: holding still loads the tendon without movement.', refs: ['elbow', 'painMonitoring'] },
  'ex-wrist-ext-ecc': { for: ['Elbow', 'Forearm'], sets: [2, 3], target: [10, 15], timesPerDay: [1, 2], daysPerWeek: [5, 7], progression: 'When 3 × 15 is easy and pain stays at or below 3/10, add 0.5–1 kg.', adjust: { Neck: ARM_REST, Shoulder: ARM_REST }, refs: ['elbow', 'painMonitoring'] },
  'ex-grip-squeeze': { for: ['Elbow', 'Forearm', 'Wrist', 'Hand & fingers'], sets: [2, 3], target: [10, 15], timesPerDay: [1, 2], daysPerWeek: [5, 7], progression: 'Use a firmer ball or a grip trainer.', caution: 'For lateral elbow pain, grip with the elbow bent first; straight-arm gripping loads the tendon more.', refs: ['elbow'] },
  'ex-wrist-ext-stretch': { for: ['Elbow', 'Forearm', 'Wrist'], sets: [2, 3], target: [20, 30], timesPerDay: [1, 3], daysPerWeek: [5, 7], progression: 'Straighten the elbow a little more as it allows.', caution: 'A gentle stretch, never sharp pain.', refs: ['elbow'] },
  'ex-wrist-flex-stretch': { for: ['Elbow', 'Forearm', 'Wrist'], sets: [2, 3], target: [20, 30], timesPerDay: [1, 3], daysPerWeek: [5, 7], progression: 'Straighten the elbow a little more as it allows.', caution: 'A gentle stretch, never sharp pain.', refs: ['elbow'] },
  'ex-pro-sup': { for: ['Elbow', 'Forearm', 'Wrist'], sets: [2, 3], target: [10, 15], timesPerDay: [1, 2], daysPerWeek: [5, 7], progression: 'Hold the hammer further from the head.', refs: ['elbow'] },
  'ex-pendulum': { for: ['Shoulder'], sets: [2, 3], target: [30, 60], timesPerDay: [2, 3], daysPerWeek: [5, 7], progression: 'Make the circles a little larger as comfort allows.', caution: 'Relaxed and pain-free: let the arm swing, don’t lift it.', adjust: { 'Lower back': 'Leaning forward loads a sore back: lean only a little, with the other hand on a table and the knees soft.' }, refs: ['shoulder'] },
  'ex-shoulder-er-band': { for: ['Shoulder', 'Upper arm'], sets: [2, 3], target: [10, 15], timesPerDay: [1, 1], daysPerWeek: [3, 5], progression: 'Move to a stronger band when 3 × 15 is easy.', refs: ['shoulder'] },
  'ex-scap-squeeze': { for: ['Shoulder', 'Upper back', 'Neck'], sets: [2, 3], target: [10, 15], timesPerDay: [1, 2], daysPerWeek: [5, 7], progression: 'Hold each squeeze longer (5–10 seconds), or add a light band.', refs: ['shoulder', 'neck'] },
  'ex-wall-slide': { for: ['Shoulder'], sets: [2, 3], target: [8, 12], timesPerDay: [1, 1], daysPerWeek: [3, 5], progression: 'Slide a little higher as range allows.', caution: 'Stop below the point where pain starts.', adjust: { Neck: 'Keep the chin gently tucked, and stop before your shoulders creep up to your ears.' }, refs: ['shoulder'] },
  'ex-cat-cow': { for: ['Lower back', 'Upper back'], sets: [1, 2], target: [8, 12], timesPerDay: [1, 2], daysPerWeek: [5, 7], progression: 'Move through a slightly bigger range.', caution: 'If rounding your back sends pain further down a leg, skip that half and tell your physio.', adjust: { Knee: KNEEL, Elbow: HANDS, Forearm: HANDS, Wrist: HANDS, Neck: 'Let the head follow the spine gently; keep it still if your neck complains.' }, refs: ['lowBack'] },
  'ex-bird-dog': { for: ['Lower back', 'Hip'], sets: [2, 3], target: [8, 12], timesPerDay: [1, 1], daysPerWeek: [3, 5], progression: 'Hold each reach for 5 seconds.', adjust: { Knee: KNEEL, Elbow: HANDS, Forearm: HANDS, Wrist: HANDS, Neck: HEAD_DOWN, Shoulder: 'Reach the arm only as high as is comfortable, or just lift the leg.' }, refs: ['lowBack'] },
  'ex-glute-bridge': { for: ['Lower back', 'Hip', 'Knee'], sets: [2, 3], target: [10, 15], timesPerDay: [1, 1], daysPerWeek: [3, 5], progression: 'Single-leg bridges, or hold at the top for 5 seconds.', adjust: { Neck: 'Keep your head relaxed on the floor; push through your feet, not your neck.' }, refs: ['lowBack', 'patellofemoral'] },
  'ex-dead-bug': { for: ['Lower back', 'Abdomen'], sets: [2, 3], target: [8, 12], timesPerDay: [1, 1], daysPerWeek: [3, 5], progression: 'Move more slowly, or straighten the legs further.', adjust: { Neck: 'Rest your head on the floor or a thin pillow; don’t lift it.', Shoulder: 'Reach the arm only as far overhead as is comfortable.' }, refs: ['lowBack'] },
  'ex-quad-set': { for: ['Knee', 'Thigh'], sets: [2, 3], target: [10, 15], timesPerDay: [2, 3], daysPerWeek: [5, 7], progression: 'Hold each squeeze for 10 seconds.', caution: 'An early-stage exercise, e.g. after surgery or when the knee is swollen.', refs: ['knee'] },
  'ex-slr': { for: ['Knee', 'Thigh', 'Hip'], sets: [2, 3], target: [10, 15], timesPerDay: [1, 2], daysPerWeek: [5, 7], progression: 'Add a light ankle weight (0.5–1 kg).', caution: 'Keep the thigh tight so the knee doesn’t bend while lifting.', adjust: { 'Lower back': 'Bend the other knee with the foot flat to protect your back, and stop if pain runs down the leg.' }, refs: ['knee'] },
  'ex-heel-slide': { for: ['Knee'], sets: [2, 3], target: [10, 15], timesPerDay: [2, 3], daysPerWeek: [5, 7], progression: 'Bend a little further each week as it allows.', refs: ['knee'] },
  'ex-wall-sit': { for: ['Knee', 'Thigh'], sets: [3, 5], target: [20, 45], timesPerDay: [1, 1], daysPerWeek: [3, 5], progression: 'Hold longer, or bend the knees a little more.', caution: 'Keep the knee bend shallow if kneecap pain flares.', adjust: { 'Lower back': 'Keep your whole back flat against the wall, and hold for less time if it aches.' }, refs: ['patellofemoral', 'knee'] },
  'ex-step-up': { for: ['Knee', 'Hip', 'Ankle'], sets: [2, 3], target: [8, 12], timesPerDay: [1, 1], daysPerWeek: [3, 5], progression: 'A higher step, or hold a light weight.', adjust: { Elbow: NO_GRIP, Forearm: NO_GRIP, Wrist: NO_GRIP, 'Lower back': 'Stand tall; if you add weight, keep it light and close to your body.' }, refs: ['patellofemoral', 'knee'] },
  'ex-clamshell': { for: ['Hip', 'Knee', 'Lower back'], sets: [2, 3], target: [10, 15], timesPerDay: [1, 1], daysPerWeek: [3, 5], progression: 'A stronger band.', adjust: { Neck: PILLOW, Shoulder: 'Rest your head on a pillow rather than propping it on your hand.' }, refs: ['patellofemoral'] },
  'ex-ankle-alphabet': { for: ['Ankle', 'Foot'], sets: [1, 2], target: [1, 2], timesPerDay: [2, 3], daysPerWeek: [5, 7], progression: 'Move to balance and calf-raise exercises as walking gets easier.', caution: 'An early-stage exercise after a sprain; reps are whole alphabets.', refs: ['ankle'] },
  'ex-calf-raise': { for: ['Ankle', 'Foot', 'Shin & calf'], sets: [2, 3], target: [10, 15], timesPerDay: [1, 1], daysPerWeek: [3, 7], progression: 'Single-leg raises, then lower slowly off a step; then add weight.', adjust: { Elbow: NO_GRIP, Forearm: NO_GRIP, Wrist: NO_GRIP }, refs: ['achilles', 'ankle', 'painMonitoring'] },
  'ex-single-leg-balance': { for: ['Ankle', 'Foot', 'Knee'], sets: [3, 4], target: [20, 30], timesPerDay: [1, 2], daysPerWeek: [5, 7], progression: 'Eyes closed, then stand on a cushion.', caution: 'Stand next to something steady to hold.', refs: ['ankle'] },
  'ex-chin-tuck': { for: ['Neck', 'Upper back', 'Head'], sets: [2, 3], target: [8, 12], timesPerDay: [2, 3], daysPerWeek: [5, 7], progression: 'Hold each tuck for 10 seconds, or do it lying down, lifting the head slightly.', refs: ['neck'] },
}

/** Keep a dose inside the vetted range. */
export const clampTo = ([min, max]: Range, v: number) => Math.min(max, Math.max(min, Math.round(v)))
