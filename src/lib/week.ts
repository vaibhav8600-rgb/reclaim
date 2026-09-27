import type { Activity, CheckIn, Drink, Injury, Meal, Measurement, Prescription, Profile, RehabSession, Sleep, Symptom } from '../db/db'
import { pegScore } from './checkin'
import { weightKg } from './constants'
import { dayKey } from './dates'
import { isRehab, sessionStats, weeklyAdherence } from './rehab'

/**
 * The week in review: every area, this week against the week before — pain, rehab, workouts, steps, sleep, weight,
 * protein, calories, water and the check-in. Plain numbers from the log; each says better, worse or about the same.
 */

const DAY = 86_400_000
export type Direction = 'better' | 'worse' | 'same'
export interface WeekRow {
  id: string
  group: 'Recovery' | 'Activity' | 'Sleep and weight' | 'Food and water'
  label: string
  now: string
  before?: string
  dir?: Direction
}

export interface WeekInput {
  injuries: Injury[]
  symptoms: Symptom[]
  sessions: RehabSession[]
  prescriptions: Prescription[]
  activity: Activity[]
  sleep: Sleep[]
  measurements: Measurement[]
  meals: Meal[]
  water: Drink[]
  checkins: CheckIn[]
  profile?: Partial<Profile>
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : undefined)
const r1 = (n: number) => Math.round(n * 10) / 10
/** Compare two numbers where `better` says which way is good, with `threshold` for "about the same". */
function compare(now: number | undefined, before: number | undefined, better: 'up' | 'down', threshold: number): Direction | undefined {
  if (now === undefined || before === undefined) return undefined
  if (Math.abs(now - before) < threshold) return 'same'
  return (now > before) === (better === 'up') ? 'better' : 'worse'
}

/** `from`: Monday 00:00 of the week to review. */
export function weekReview(d: WeekInput, from: number): WeekRow[] {
  const prev = from - 7 * DAY
  const inWeek = (ms: number, start: number) => ms >= start && ms < start + 7 * DAY
  const keyIn = (key: string, start: number) => key >= dayKey(start) && key < dayKey(start + 7 * DAY)
  const rows: WeekRow[] = []
  const add = (row: WeekRow) => rows.push(row)

  // Recovery: pain for each open injury
  for (const i of d.injuries.filter((i) => !i.deletedAt && i.status !== 'resolved')) {
    const pain = (start: number) => mean(d.symptoms.filter((s) => !s.deletedAt && s.injuryId === i.id && s.type === 'pain' && inWeek(s.recordedAt, start)).map((s) => s.severity))
    const [n, b] = [pain(from), pain(prev)]
    if (n !== undefined) add({ id: `pain-${i.id}`, group: 'Recovery', label: `${i.name} pain`, now: `${r1(n)}/10 average`, before: b !== undefined ? `${r1(b)}/10` : undefined, dir: compare(n, b, 'down', 0.5) })
  }
  const plan = d.prescriptions.filter((p) => !p.deletedAt && p.active)
  const rehab = d.sessions.filter((s) => !s.deletedAt && isRehab(s))
  if (plan.length) {
    const a = weeklyAdherence(plan, rehab, from)
    const b = weeklyAdherence(plan, rehab, prev)
    const pct = (x: { done: number; planned: number }) => (x.planned ? Math.min(100, Math.round((x.done / x.planned) * 100)) : 0)
    add({ id: 'rehab', group: 'Recovery', label: 'Rehab exercises done', now: `${a.done} of ${a.planned} (${pct(a)}%)`, before: `${pct(b)}%`, dir: compare(pct(a), pct(b), 'up', 10) })
  }
  const peg = (start: number) => mean(d.checkins.filter((c) => !c.deletedAt && inWeek(c.recordedAt, start)).flatMap((c) => (pegScore(c) === undefined ? [] : [pegScore(c)!])))
  const [pn, pb] = [peg(from), peg(prev)]
  if (pn !== undefined) add({ id: 'checkin', group: 'Recovery', label: 'Pain and life (check-in)', now: `${r1(pn)}/10`, before: pb !== undefined ? `${r1(pb)}/10` : undefined, dir: compare(pn, pb, 'down', 1) })

  // Activity
  const steps = (start: number) => mean(d.activity.filter((a) => !a.deletedAt && a.steps && keyIn(a.date, start)).map((a) => a.steps!))
  const [sn, sb] = [steps(from), steps(prev)]
  if (sn !== undefined) add({ id: 'steps', group: 'Activity', label: 'Steps a day', now: Math.round(sn).toLocaleString(), before: sb !== undefined ? Math.round(sb).toLocaleString() : undefined, dir: compare(sn, sb, 'up', Math.max(300, (sb ?? 0) * 0.1)) })
  const workouts = (start: number) => d.sessions.filter((s) => !s.deletedAt && !isRehab(s) && inWeek(s.recordedAt, start))
  const [wn, wb] = [workouts(from), workouts(prev)]
  if (wn.length || wb.length) {
    const minutes = wn.reduce((n, s) => n + sessionStats(s).minutes, 0)
    add({ id: 'workouts', group: 'Activity', label: 'Workouts', now: `${wn.length}${wn.length ? ` · ${minutes} min` : ''}`, before: String(wb.length), dir: compare(wn.length, wb.length, 'up', 1) })
  }

  // Sleep and weight
  const target = d.profile?.sleepTarget ?? 8
  const hours = (start: number) => {
    const byNight = new Map<string, number>()
    for (const s of d.sleep.filter((s) => !s.deletedAt && inWeek(s.wakeAt, start))) byNight.set(dayKey(s.wakeAt), (byNight.get(dayKey(s.wakeAt)) ?? 0) + (s.wakeAt - s.bedAt) / 3_600_000)
    return mean([...byNight.values()])
  }
  const [hn, hb] = [hours(from), hours(prev)]
  if (hn !== undefined) {
    const gap = (h: number | undefined) => (h === undefined ? undefined : -Math.abs(h - target)) // closer to the target is better
    add({ id: 'sleep', group: 'Sleep and weight', label: 'Sleep a night', now: `${r1(hn)} h`, before: hb !== undefined ? `${r1(hb)} h` : undefined, dir: compare(gap(hn), gap(hb), 'up', 0.25) })
  }
  const weights = d.measurements.filter((m) => !m.deletedAt && m.kind === 'weight').sort((a, b) => a.recordedAt - b.recordedAt)
  const lastBefore = (end: number) => [...weights].reverse().find((m) => m.recordedAt < end)
  const wNow = weights.filter((m) => inWeek(m.recordedAt, from)).at(-1)
  const wThen = lastBefore(from)
  if (wNow) {
    const kn = weightKg(wNow)
    const kb = wThen ? weightKg(wThen) : undefined
    const goal = d.profile?.weightGoal
    const dist = (k: number | undefined) => (k === undefined || !goal ? undefined : -Math.abs(k - goal))
    const change = kn !== undefined && kb !== undefined ? r1(kn - kb) : undefined
    add({
      id: 'weight', group: 'Sleep and weight', label: 'Weight',
      now: `${wNow.value} ${wNow.unit}${change !== undefined && change !== 0 ? ` (${change > 0 ? '+' : ''}${change} kg)` : ''}`,
      before: wThen ? `${wThen.value} ${wThen.unit}` : undefined,
      dir: goal ? compare(dist(kn), dist(kb), 'up', 0.2) : undefined,
    })
  }

  // Food and water: averages over the days something was logged, and days the goal was met
  const perDay = <T>(xs: T[], at: (x: T) => number, val: (x: T) => number, start: number) => {
    const days = new Map<string, number>()
    for (const x of xs) if (inWeek(at(x), start)) days.set(dayKey(at(x)), (days.get(dayKey(at(x))) ?? 0) + val(x))
    return [...days.values()]
  }
  const liveMeals = d.meals.filter((m) => !m.deletedAt)
  /** `at-least` (protein): more is better, met at or above the goal. `near` (calories): closer is better, met within 10%. */
  const food = (label: string, id: string, val: (m: Meal) => number | undefined, goal: number | undefined, unit: string, kind: 'at-least' | 'near') => {
    const days = (start: number) => perDay(liveMeals.filter((m) => val(m) !== undefined), (m) => m.recordedAt, (m) => val(m)!, start)
    const [n, b] = [days(from), days(prev)]
    if (!n.length) return
    const met = goal ? n.filter((v) => (kind === 'at-least' ? v >= goal : Math.abs(v - goal) <= goal * 0.1)).length : undefined
    const score = (xs: number[]) => (!xs.length ? undefined : kind === 'at-least' ? mean(xs) : -Math.abs(mean(xs)! - goal!))
    add({ id, group: 'Food and water', label, now: `${Math.round(mean(n)!).toLocaleString()} ${unit} a day${met !== undefined ? ` · goal met ${met} of ${n.length} days` : ''}`, before: b.length ? `${Math.round(mean(b)!).toLocaleString()} ${unit}` : undefined, dir: goal ? compare(score(n), score(b), 'up', goal * 0.05) : undefined })
  }
  food('Protein', 'protein', (m) => m.protein, d.profile?.proteinTarget, 'g', 'at-least')
  food('Calories', 'calories', (m) => m.calories, d.profile?.calorieTarget, 'kcal', 'near')
  const water = (start: number) => perDay(d.water.filter((w) => !w.deletedAt), (w) => w.recordedAt, (w) => w.amount, start)
  const [wtn, wtb] = [water(from), water(prev)]
  if (wtn.length) {
    const goal = d.profile?.waterTarget
    add({ id: 'water', group: 'Food and water', label: 'Water', now: `${r1(mean(wtn)! / 1000)} L a day${goal ? ` · goal met ${wtn.filter((v) => v >= goal).length} of ${wtn.length} days` : ''}`, before: wtb.length ? `${r1(mean(wtb)! / 1000)} L` : undefined, dir: compare(mean(wtn), mean(wtb), 'up', 150) })
  }
  return rows
}
