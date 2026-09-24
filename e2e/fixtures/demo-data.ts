/**
 * Realistic, deterministic demo data for end-to-end tests (and for trying the app).
 * One person, ~75 days: an improving tennis elbow with weekday-evening flare pattern,
 * a recent lower-back issue, an old resolved ankle sprain, weekly measurements,
 * notes, a physio plan with progressive loading and imperfect adherence, and three weeks of meals.
 *
 * Timestamps are relative to `now` in the local timezone. Nothing is ever in the future.
 */
import type { Drink, Exercise, FoodItem, HealthFact, Injury, JournalEntry, Meal, MealSlot, Measurement, Prescription, Profile, RehabSession, SavedMeal, SessionItem, Symptom } from '../../src/db/db'

export interface DemoBackup {
  app: 'reclaim'
  schemaVersion: 1
  exportedAt: string
  data: {
    profile: Profile[]
    injuries: Injury[]
    symptoms: Symptom[]
    measurements: Measurement[]
    journal: JournalEntry[]
    exercises: Exercise[]
    prescriptions: Prescription[]
    sessions: RehabSession[]
    meals: Meal[]
    savedMeals: SavedMeal[]
    facts: HealthFact[]
    water: Drink[]
  }
}

const DAY = 86_400_000

/** mulberry32: small, fast, seedable PRNG. */
function prng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export const IDS = {
  elbow: 'demo-injury-elbow',
  back: 'demo-injury-back',
  ankle: 'demo-injury-ankle',
  isoHold: 'demo-rx-iso',
  eccentric: 'demo-rx-eccentric',
  grip: 'demo-rx-grip',
  stretch: 'demo-rx-stretch',
  catCow: 'demo-rx-catcow',
  birdDog: 'demo-rx-birddog',
  flexorPaused: 'demo-rx-flexor',
} as const

export function generateDemoData({ now = Date.now(), seed = 7 }: { now?: number; seed?: number } = {}): DemoBackup {
  const rand = prng(seed)
  const noise = (amp: number) => (rand() * 2 - 1) * amp
  const clamp = (v: number) => Math.max(0, Math.min(10, Math.round(v)))
  const midnight = (() => {
    const d = new Date(now)
    d.setHours(0, 0, 0, 0)
    return d.getTime()
  })()
  /** Local time `h:m` on the day `d` days ago. */
  const at = (d: number, h: number, m = 0) => {
    const x = new Date(midnight - d * DAY + 12 * 3_600_000) // noon avoids DST edge cases
    x.setHours(h, m, 0, 0)
    return x.getTime()
  }
  const dayKey = (d: number) => {
    const x = new Date(at(d, 12))
    return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
  }
  const weekday = (d: number) => {
    const w = new Date(at(d, 12)).getDay()
    return w >= 1 && w <= 5
  }
  let seq = 0
  const id = (p: string) => `demo-${p}-${String(++seq).padStart(4, '0')}`
  const stamp = (t: number) => ({ createdAt: t, updatedAt: t })
  const past = (t: number) => t <= now - 60_000

  const profile: Profile[] = [{ id: 'me', name: 'Alex', proteinTarget: 130, waterTarget: 2500, ...stamp(at(75, 9)) }]

  const injuries: Injury[] = [
    {
      id: IDS.elbow, name: 'Tennis elbow', bodyRegion: 'Elbow', side: 'right', startDate: dayKey(70), status: 'improving',
      diagnosis: 'Lateral epicondylitis', mechanism: 'Gradual onset after long hours of typing and weekend badminton',
      notes: 'Physio every other Tuesday.', ...stamp(at(70, 21)),
    },
    {
      id: IDS.back, name: 'Lower back stiffness', bodyRegion: 'Lower back', side: 'none', startDate: dayKey(20), status: 'monitoring',
      mechanism: 'After a 6-hour drive', ...stamp(at(20, 22)),
    },
    {
      id: IDS.ankle, name: 'Left ankle sprain', bodyRegion: 'Ankle', side: 'left', startDate: dayKey(160), status: 'resolved',
      diagnosis: 'Grade 1 lateral ankle sprain', mechanism: 'Rolled it on a trail run', ...stamp(at(160, 18)),
    },
  ]

  /* ── Symptoms ── */
  const symptoms: Symptom[] = []
  const elbowBase = (d: number) => 2.2 + 4.3 * (d / 70) + (d >= 22 && d <= 24 ? 2 : 0) // flare after badminton
  for (let d = 70; d >= 0; d--) {
    if (d > 0 && rand() < 0.12) continue // some days nothing gets logged
    const morning = at(d, 8, 20 + Math.floor(rand() * 30))
    if (past(morning)) symptoms.push({ id: id('sym'), injuryId: IDS.elbow, type: 'pain', severity: clamp(elbowBase(d) - 0.8 + noise(0.7)), recordedAt: morning, source: 'user', ...stamp(morning) })
    const evening = at(d, 19, 45 + Math.floor(rand() * 40))
    if (past(evening)) {
      symptoms.push({
        id: id('sym'), injuryId: IDS.elbow, type: 'pain', severity: clamp(elbowBase(d) + (weekday(d) ? 1.2 : 0.2) + noise(0.8)),
        trigger: weekday(d) ? 'After work' : d >= 22 && d <= 24 ? 'Badminton' : undefined, recordedAt: evening, source: 'user', ...stamp(evening),
      })
    }
  }
  for (let d = 20; d >= 0; d--) {
    const t = at(d, 7, 40)
    if (rand() < 0.7 && past(t)) {
      symptoms.push({ id: id('sym'), injuryId: IDS.back, type: 'stiffness', severity: clamp(4 - (20 - d) * 0.1 + noise(0.8)), trigger: 'Morning', recordedAt: t, source: 'user', ...stamp(t) })
    }
  }
  for (let d = 160; d >= 130; d -= 2) {
    const t = at(d, 20)
    symptoms.push({ id: id('sym'), injuryId: IDS.ankle, type: 'pain', severity: clamp(6 - (160 - d) * 0.18 + noise(0.6)), recordedAt: t, source: 'user', ...stamp(t) })
  }
  // A mistaken entry the user deleted (tombstone).
  const oops = at(5, 13)
  symptoms.push({ id: id('sym'), injuryId: IDS.elbow, type: 'pain', severity: 9, recordedAt: oops, source: 'user', createdAt: oops, updatedAt: oops + 30_000, deletedAt: oops + 30_000 })

  /* ── Measurements ── */
  const measurements: Measurement[] = []
  for (let d = 70; d >= 0; d--) {
    if (d % 7 === 0) {
      const t = at(d, 7, 10)
      if (past(t)) measurements.push({ id: id('m'), kind: 'weight', value: Math.round((86.9 - (70 - d) * 0.022 + noise(0.25)) * 10) / 10, unit: 'kg', method: 'Morning, before breakfast', recordedAt: t, source: 'user', ...stamp(t) })
    }
    if (d % 7 === 3) {
      const t = at(d, 18, 30)
      if (past(t)) {
        measurements.push({ id: id('m'), kind: 'grip', value: Math.round((22 + (70 - d) * 0.13 + noise(0.8)) * 2) / 2, unit: 'kg', side: 'right', injuryId: IDS.elbow, method: 'Dynamometer, standing', recordedAt: t, source: 'user', ...stamp(t) })
        measurements.push({ id: id('m'), kind: 'grip', value: Math.round((38 + noise(1)) * 2) / 2, unit: 'kg', side: 'left', method: 'Dynamometer, standing', recordedAt: t + 60_000, source: 'user', ...stamp(t + 60_000) })
      }
    }
  }
  const typo = at(12, 7, 30)
  measurements.push({ id: id('m'), kind: 'weight', value: 68.6, unit: 'kg', recordedAt: typo, source: 'user', createdAt: typo, updatedAt: typo + 20_000, deletedAt: typo + 20_000 })

  /* ── Notes ── */
  const noteText: [number, string][] = [
    [69, 'Saw the physio today. Diagnosis: tennis elbow. Told to rest from badminton for 4 weeks and start isometrics.'],
    [60, 'Started the exercise plan. Isometric holds feel fine, eccentrics a bit sore after.'],
    [52, 'Elbow fine in the morning, sore after 8 hours at the laptop. Raised the monitor and lowered the chair.'],
    [45, 'Physio moved me to 2 kg for eccentrics. Pain during stays at 3–4, which she said is OK.'],
    [38, 'Good week. Typing breaks every 45 min seem to help.'],
    [24, 'Played badminton against advice. Big mistake — elbow flared up badly in the evening.'],
    [21, 'Flare settling. Back stiff after the long drive to Pune.'],
    [15, 'Up to 3 kg on eccentrics. Grip feels noticeably stronger.'],
    [9, 'Mornings are almost pain-free now. Evenings after work still 3–4.'],
    [3, 'Physio says I can try light badminton drills in two weeks if this continues.'],
  ]
  const journal: JournalEntry[] = noteText.map(([d, text]) => ({ id: id('note'), text, recordedAt: at(d, 21, 30), source: 'user', ...stamp(at(d, 21, 30)) }))

  /* ── Rehab plan ── */
  const rx = (pid: string, exerciseId: string, startDay: number, p: Omit<Prescription, 'id' | 'exerciseId' | 'createdAt' | 'updatedAt'>): Prescription => ({
    id: pid, exerciseId, ...p, ...stamp(at(startDay, 20)),
  })
  const prescriptions: Prescription[] = [
    rx(IDS.isoHold, 'ex-wrist-ext-iso', 60, { injuryId: IDS.elbow, sets: 5, target: 45, timesPerDay: 2, daysPerWeek: 7, active: true, notes: 'Pain up to 3/10 is fine.' }),
    { ...rx(IDS.eccentric, 'ex-wrist-ext-ecc', 60, { injuryId: IDS.elbow, sets: 3, target: 15, load: 3, timesPerDay: 1, daysPerWeek: 7, active: true, notes: 'Lower over 4 seconds.' }), updatedAt: at(15, 20) },
    rx(IDS.grip, 'ex-grip-squeeze', 60, { injuryId: IDS.elbow, sets: 3, target: 20, timesPerDay: 1, daysPerWeek: 5, active: true }),
    rx(IDS.stretch, 'ex-wrist-ext-stretch', 60, { injuryId: IDS.elbow, sets: 3, target: 30, timesPerDay: 2, daysPerWeek: 7, active: true }),
    rx(IDS.catCow, 'ex-cat-cow', 18, { injuryId: IDS.back, sets: 2, target: 10, timesPerDay: 1, daysPerWeek: 7, active: true }),
    rx(IDS.birdDog, 'ex-bird-dog', 18, { injuryId: IDS.back, sets: 3, target: 10, timesPerDay: 1, daysPerWeek: 5, active: true }),
    { ...rx(IDS.flexorPaused, 'ex-wrist-flex-stretch', 60, { injuryId: IDS.elbow, sets: 3, target: 30, timesPerDay: 1, daysPerWeek: 7, active: false }), updatedAt: at(30, 20) },
  ]

  /* ── Sessions ── */
  const eccentricLoad = (d: number) => (d > 40 ? 1 : d > 15 ? 2 : 3)
  const sessions: RehabSession[] = []
  for (let d = 60; d >= 0; d--) {
    if (rand() < 0.2) continue // realistic: ~80% of days
    const end = Math.min(at(d, 19, 15), now - 5 * 60_000)
    if (end < at(d, 0) + 60_000) continue
    const start = end - 25 * 60_000
    const items: SessionItem[] = prescriptions
      .filter((p) => p.active && p.createdAt <= start)
      .map((p) => ({
        exerciseId: p.exerciseId,
        prescriptionId: p.id,
        sets: Array.from({ length: p.sets }, () => ({
          amount: p.target,
          load: p.id === IDS.eccentric ? eccentricLoad(d) : undefined,
          done: rand() < 0.92,
        })),
        painDuring: p.id === IDS.eccentric ? clamp(elbowBase(d) - 0.5 + noise(0.8)) : undefined,
      }))
    const before = clamp(elbowBase(d) + noise(0.6))
    sessions.push({
      id: id('session'), startedAt: start, recordedAt: end, painBefore: before, painAfter: clamp(before + (rand() < 0.7 ? -1 : 0)),
      items, notes: d === 45 ? 'First session at 2 kg.' : undefined, source: 'user', ...stamp(end),
    })
  }

  /* ── Meals (last 21 days; generated last so the data above stays the same) ── */
  const food = (name: string, amount: string, protein: number, calories: number): FoodItem => ({ name, amount, protein, calories })
  const MENU: Record<MealSlot, { name: string; items: FoodItem[] }[]> = {
    breakfast: [
      { name: 'Oats with milk and whey', items: [food('Rolled oats', '60 g', 8, 230), food('Milk', '250 ml', 8, 160), food('Whey protein', '1 scoop', 24, 120)] },
      { name: 'Eggs on toast', items: [food('Eggs', '3 large', 19, 230), food('Wholemeal toast', '2 slices', 8, 200)] },
      { name: 'Greek yogurt and berries', items: [food('Greek yogurt', '250 g', 25, 240), food('Mixed berries', '1 cup', 1, 70)] },
    ],
    lunch: [
      { name: 'Chicken rice bowl', items: [food('Grilled chicken', '150 g', 46, 250), food('Rice', '1 cup cooked', 4, 205), food('Vegetables', '1 cup', 3, 60)] },
      { name: 'Dal, rice and paneer', items: [food('Dal', '1 bowl', 12, 230), food('Rice', '1 cup cooked', 4, 205), food('Paneer', '80 g', 15, 260)] },
      { name: 'Tuna sandwich', items: [food('Tuna', '1 can', 25, 120), food('Bread', '2 slices', 8, 200)] },
    ],
    dinner: [
      { name: 'Salmon and potatoes', items: [food('Salmon fillet', '150 g', 30, 310), food('Potatoes', '200 g', 4, 160), food('Green beans', '1 cup', 2, 35)] },
      { name: 'Chickpea curry and roti', items: [food('Chickpea curry', '1 bowl', 13, 300), food('Roti', '2', 6, 240)] },
      { name: 'Chicken pasta', items: [food('Chicken', '120 g', 37, 200), food('Pasta', '1.5 cups cooked', 11, 330)] },
    ],
    snack: [
      { name: 'Protein shake', items: [food('Whey protein', '1 scoop', 24, 120), food('Milk', '250 ml', 8, 160)] },
      { name: 'Almonds', items: [food('Almonds', '30 g', 6, 170)] },
      { name: 'Cottage cheese', items: [food('Cottage cheese', '150 g', 17, 140)] },
    ],
  }
  const sum = (items: FoodItem[], k: 'protein' | 'calories') => items.reduce((a, i) => a + (i[k] ?? 0), 0)
  const meals: Meal[] = []
  const slotHour: Record<MealSlot, number> = { breakfast: 8, lunch: 13, dinner: 20, snack: 16 }
  for (let d = 20; d >= 0; d--) {
    if (d > 0 && rand() < 0.15) continue // some days no meals get logged
    for (const slot of ['breakfast', 'lunch', 'snack', 'dinner'] as MealSlot[]) {
      if (slot === 'snack' ? rand() < 0.5 : rand() < 0.1) continue
      const t = at(d, slotHour[slot], Math.floor(rand() * 40))
      if (!past(t)) continue
      const choice = MENU[slot][Math.floor(rand() * MENU[slot].length)]
      const estimated = slot === 'lunch' && rand() < 0.3
      meals.push({
        id: id('meal'), name: choice.name, slot, items: choice.items, protein: sum(choice.items, 'protein'), calories: sum(choice.items, 'calories'),
        recordedAt: t, source: estimated ? 'user_confirmed' : 'user', ...stamp(t),
      })
    }
  }
  const savedMeals: SavedMeal[] = [MENU.breakfast[0], MENU.snack[0], MENU.lunch[0]].map((m, i) => ({
    id: `demo-saved-${i}`, name: m.name, items: m.items, protein: sum(m.items, 'protein'), calories: sum(m.items, 'calories'), ...stamp(at(21, 9) + i),
  }))

  // A week of water: glasses through the day, fewer on some days.
  const water: Drink[] = []
  for (let d = 6; d >= 0; d--) {
    for (const h of [8, 10, 12, 14, 16, 18, 20]) {
      const t = at(d, h, Math.floor(rand() * 50))
      if (past(t) && rand() < 0.8) water.push({ id: id('water'), amount: rand() < 0.3 ? 500 : 250, recordedAt: t, source: 'user', ...stamp(t) })
    }
  }

  // Facts confirmed from two blood tests and the MRI report (as if read by AI and reviewed).
  const dateKey = (d: number) => { const x = new Date(at(d, 12)); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}` }
  const fact = (f: Omit<HealthFact, 'id' | 'createdAt' | 'updatedAt' | 'source' | 'date'>, d: number): HealthFact => ({ id: id('fact'), source: 'user_confirmed', ...stamp(at(d, 18)), ...f, date: dateKey(d) })
  const facts: HealthFact[] = [
    fact({ kind: 'condition', name: 'Lateral epicondylitis', detail: 'Right elbow', evidence: 'Impression: right lateral epicondylitis' }, 60),
    fact({ kind: 'imaging', name: 'MRI right elbow', detail: 'Thickening of the common extensor tendon origin with no tear', evidence: 'Common extensor origin thickened, no tear' }, 60),
    fact({ kind: 'medication', name: 'Cholecalciferol 60,000 IU', detail: 'Once a week for 8 weeks', evidence: 'Tab. Cholecalciferol 60K IU weekly x 8 wks' }, 55),
    fact({ kind: 'lab', name: 'Vitamin D (25-OH)', value: 16, unit: 'ng/mL', range: '30 - 100', flag: 'low', evidence: '25-OH Vitamin D 16.0 ng/mL 30 - 100' }, 55),
    fact({ kind: 'lab', name: 'Haemoglobin', value: 14.1, unit: 'g/dL', range: '13.0 - 17.0', evidence: 'Haemoglobin 14.1 g/dL' }, 55),
    fact({ kind: 'lab', name: 'Vitamin D (25-OH)', value: 34, unit: 'ng/mL', range: '30 - 100', evidence: '25-OH Vitamin D 34.2 ng/mL 30 - 100' }, 5),
    fact({ kind: 'lab', name: 'CRP', value: 2.1, unit: 'mg/L', range: '< 5', evidence: 'C-Reactive Protein 2.1 mg/L' }, 5),
  ]

  return {
    app: 'reclaim',
    schemaVersion: 1,
    exportedAt: new Date(now).toISOString(),
    data: { profile, injuries, symptoms, measurements, journal, exercises: [], prescriptions, sessions, meals, savedMeals, facts, water },
  }
}
