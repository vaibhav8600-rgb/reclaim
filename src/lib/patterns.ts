import { dayKey } from './dates'

/**
 * Personal patterns: is pain different the day after fewer steps, a short night or a rehab session? Plain
 * comparisons of the user's own days — patterns, not proof (other things change too). Reported only with at least
 * 5 days on each side and a difference of at least 1 point on the 0–10 scale.
 */

export interface Pattern {
  id: 'steps' | 'sleep' | 'rehab'
  text: string
  /** Mean pain in each group, and how many days each */
  a: { label: string; mean: number; days: number }
  b: { label: string; mean: number; days: number }
}

const MIN_DAYS = 5
const MIN_DIFF = 1
const round1 = (n: number) => Math.round(n * 10) / 10
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length
const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)] }
const prevDay = (key: string) => { const [y, m, d] = key.split('-').map(Number); return dayKey(new Date(y, m - 1, d - 1, 12).getTime()) }

export interface PatternInput {
  pain: { recordedAt: number; severity: number }[]
  steps: { date: string; steps?: number }[]
  sleep: { bedAt: number; wakeAt: number }[]
  sessions: { recordedAt: number }[]
}

/** Found patterns, and which comparisons had enough days to be checked at all. */
export function painPatterns({ pain, steps, sleep, sessions }: PatternInput) {
  const byDay = new Map<string, number[]>()
  for (const p of pain) byDay.set(dayKey(p.recordedAt), [...(byDay.get(dayKey(p.recordedAt)) ?? []), p.severity])
  const painOn = new Map([...byDay].map(([d, v]) => [d, mean(v)]))
  const found: Pattern[] = []
  const checked: Pattern['id'][] = []

  /** Pain on each day, split by a yes/no about that day (or the day before). */
  const compare = (id: Pattern['id'], split: (day: string) => boolean | undefined, yes: string, no: string, text: (y: number, n: number) => string) => {
    const y: number[] = []
    const n: number[] = []
    for (const [day, p] of painOn) {
      const s = split(day)
      if (s !== undefined) (s ? y : n).push(p)
    }
    if (y.length < MIN_DAYS || n.length < MIN_DAYS) return
    checked.push(id)
    const [my, mn] = [round1(mean(y)), round1(mean(n))]
    if (Math.abs(my - mn) >= MIN_DIFF) found.push({ id, text: text(my, mn), a: { label: yes, mean: my, days: y.length }, b: { label: no, mean: mn, days: n.length } })
  }

  // Steps the day before
  const stepsOn = new Map(steps.filter((s) => s.steps).map((s) => [s.date, s.steps!]))
  const stepDays = [...painOn.keys()].flatMap((d) => (stepsOn.has(prevDay(d)) ? [stepsOn.get(prevDay(d))!] : []))
  if (stepDays.length >= 2 * MIN_DAYS) {
    const cut = Math.max(500, Math.round(median(stepDays) / 500) * 500)
    const c = cut.toLocaleString('en')
    compare('steps', (d) => (stepsOn.has(prevDay(d)) ? stepsOn.get(prevDay(d))! < cut : undefined), `after under ${c} steps`, `after ${c} or more`, (y, n) =>
      y > n ? `Pain averages ${y} the day after fewer than ${c} steps, and ${n} after more. Moving more seems to help.` : `Pain averages ${n} the day after ${c} or more steps, and ${y} after fewer — build up activity more gently.`)
  }

  // The night before (by wake-up day)
  const hoursOn = new Map<string, number>()
  for (const s of sleep) hoursOn.set(dayKey(s.wakeAt), (hoursOn.get(dayKey(s.wakeAt)) ?? 0) + (s.wakeAt - s.bedAt) / 3_600_000)
  const nights = [...painOn.keys()].flatMap((d) => (hoursOn.has(d) ? [hoursOn.get(d)!] : []))
  if (nights.length >= 2 * MIN_DAYS) {
    const cut = Math.round(median(nights) * 2) / 2
    compare('sleep', (d) => (hoursOn.has(d) ? hoursOn.get(d)! < cut : undefined), `after under ${cut} h of sleep`, `after ${cut} h or more`, (y, n) =>
      y > n ? `Pain averages ${y} after nights under ${cut} hours of sleep, and ${n} after longer ones.` : `Pain averages ${n} after nights of ${cut} hours or more, and ${y} after shorter ones.`)
  }

  // A rehab session the day before
  const sessionDays = new Set(sessions.map((s) => dayKey(s.recordedAt)))
  if (sessionDays.size) {
    compare('rehab', (d) => sessionDays.has(prevDay(d)), 'the day after rehab', 'after days without', (y, n) =>
      y < n ? `Pain averages ${y} the day after a rehab session, and ${n} after days without. The exercises seem to help.` : `Pain averages ${y} the day after a rehab session, and ${n} after days without — the load may be a little much; the morning check helps tune it.`)
  }

  return { found, checked }
}
